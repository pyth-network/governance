import {
  ANCHOR_CONFIG_PATH,
  getPortNumber,
  readAnchorConfig,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { StakeConnection } from "../app";
import assert from "assert";
import { BN } from "@project-serum/anchor";
import { assertBalanceMatches, loadAndUnlock } from "./utils/api_utils";

const portNumber = getPortNumber(path.basename(__filename));

describe("unlock_api", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: AbortController;

  let stakeAccountAddress;

  let owner: PublicKey;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.program.provider.wallet.publicKey;
  });

  it("deposit, lock, unlock, same epoch", async () => {
    await stakeConnection.depositAndLockTokens(undefined, 100);

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    stakeAccountAddress = res[0].address;

    await assertBalanceMatches(
      stakeConnection,
      owner,
<<<<<<< HEAD
      { locked: new BN(100), unvested: new BN(0), withdrawable: new BN(0) },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, new BN(50));
=======
      { locked: 100, unvested: 0, withdrawable: 0 },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, 50);
>>>>>>> a99b218 (add unlock api tests)

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 50, unvested: 0, withdrawable: 50 },
      await stakeConnection.getTime()
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(3)))
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 50, unvested: 0, withdrawable: 50 },
      await stakeConnection.getTime()
    );
  });

  it("deposit more, unlock first unlocks oldest position (FIFO)", async () => {
    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);

    await stakeConnection.depositAndLockTokens(res[0], 100);

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 150, unvested: 0, withdrawable: 50 },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, 50);

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 150, unvested: 0, withdrawable: 50 },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, new BN(100));

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 100, unvested: 0, withdrawable: 100 },
      await stakeConnection.getTime()
    );
  });

  it("time passes, first position becomes unlocked, now unlock targets second position", async () => {
    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(3)))
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 50, unvested: 0, withdrawable: 150 },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, 50);

    await assertBalanceMatches(
        stakeConnection,
        owner,
        { locked: 50, unvested: 0, withdrawable: 150 },
        await stakeConnection.getTime()
      );

  });

  it("time passes, all is withdrawable now", async () => {
    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(3)))
      .rpc();

    await assertBalanceMatches(
        stakeConnection,
        owner,
        { locked: 0, unvested: 0, withdrawable: 200 },
        await stakeConnection.getTime()
      );

  });


  after(async () => {
    controller.abort();
  });
});
