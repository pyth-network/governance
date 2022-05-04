import {
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  getPortNumber,
  makeDefaultConfig,
  readAnchorConfig,
  requestPythAirdrop,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { StakeConnection, PythBalance } from "../app";
import { BN, Wallet } from "@project-serum/anchor";
import { assertVoterWeightEquals, loadAndUnlock } from "./utils/api_utils";

const portNumber = getPortNumber(path.basename(__filename));

describe("voter_weight_test", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let stakeAccountAddress;

  let owner: PublicKey;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.provider.wallet.publicKey;
  });

  it("deposit, lock, make sure voter weight appears after warmup", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("100")
    );
    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      },
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      }
    );

    // undo 50 of the lock
    await loadAndUnlock(stakeConnection, owner, PythBalance.fromString("50"));
    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      },
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      }
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      },
      {
        rawVoterWeight: PythBalance.fromString("50"),
        totalLockedBalance: PythBalance.fromString("50"),
      }
    );
  });

  it("deposit more while other position unlocking", async () => {
    await loadAndUnlock(stakeConnection, owner, PythBalance.fromString("50"));
    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      },
      {
        rawVoterWeight: PythBalance.fromString("50"),
        totalLockedBalance: PythBalance.fromString("50"),
      }
    );

    // end the epoch so that the tokens start unlocking
    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    const stakeAccount = await stakeConnection.getMainAccount(owner);
    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("50"),
        totalLockedBalance: PythBalance.fromString("50"),
      },
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      }
    );

    await stakeConnection.depositAndLockTokens(
      stakeAccount,
      PythBalance.fromString("100")
    );

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("50"),
        totalLockedBalance: PythBalance.fromString("50"),
      },
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      }
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("0"),
      },
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("100"),
      }
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(3)))
      .rpc();

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("100"),
      },
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("100"),
      }
    );
  });

  it("new user, max weight adds up", async () => {
    const bob = new Keypair();

    const bobConnection = await StakeConnection.createStakeConnection(
      stakeConnection.program.provider.connection,
      new Wallet(bob),
      stakeConnection.program.programId
    );

    await bobConnection.program.provider.connection.requestAirdrop(
      bob.publicKey,
      1_000_000_000_000
    );

    await requestPythAirdrop(
      bob.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("1000"),
      stakeConnection.program.provider.connection
    );

    await bobConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("500")
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(3)))
      .rpc();

    await assertVoterWeightEquals(
      bobConnection,
      bob.publicKey,
      {
        rawVoterWeight: PythBalance.fromString("500"),
        totalLockedBalance: PythBalance.fromString("600"),
      },
      {
        rawVoterWeight: PythBalance.fromString("500"),
        totalLockedBalance: PythBalance.fromString("600"),
      }
    );

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("600"),
      },
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("600"),
      }
    );

    await loadAndUnlock(stakeConnection, owner, PythBalance.fromString("100"));

    const bobStakeAccount = await stakeConnection.getMainAccount(bob.publicKey);
    await bobConnection.depositAndLockTokens(
      bobStakeAccount,
      PythBalance.fromString("50")
    );

    await assertVoterWeightEquals(
      bobConnection,
      bob.publicKey,
      {
        rawVoterWeight: PythBalance.fromString("500"),
        totalLockedBalance: PythBalance.fromString("600"),
      },
      {
        rawVoterWeight: PythBalance.fromString("500"),
        totalLockedBalance: PythBalance.fromString("600"),
      }
    );

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("600"),
      },
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("600"),
      }
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    await assertVoterWeightEquals(
      bobConnection,
      bob.publicKey,
      {
        rawVoterWeight: PythBalance.fromString("500"),
        totalLockedBalance: PythBalance.fromString("600"),
      },
      {
        rawVoterWeight: PythBalance.fromString("550"),
        totalLockedBalance: PythBalance.fromString("550"),
      }
    );

    await assertVoterWeightEquals(
      stakeConnection,
      owner,
      {
        rawVoterWeight: PythBalance.fromString("100"),
        totalLockedBalance: PythBalance.fromString("600"),
      },
      {
        rawVoterWeight: PythBalance.fromString("0"),
        totalLockedBalance: PythBalance.fromString("550"),
      }
    );
  });

  after(async () => {
    controller.abort();
  });
});
