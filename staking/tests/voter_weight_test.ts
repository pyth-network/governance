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
import {
  assertBalanceMatches,
  assertVoterWeightEquals,
  loadAndUnlock,
} from "./utils/api_utils";

const portNumber = getPortNumber(path.basename(__filename));

describe("voter_weight_test", async () => {
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

  it("deposit, lock, make sure voter weight appears after warmup", async () => {
    await stakeConnection.depositAndLockTokens(undefined, new BN(100));

    await assertVoterWeightEquals(stakeConnection, owner, 0);

    // undo 50 of the lock
    await loadAndUnlock(stakeConnection, owner, new BN(50));
    await assertVoterWeightEquals(stakeConnection, owner, 0);

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    await assertVoterWeightEquals(stakeConnection, owner, 50);
  });

  it("deposit more while other position unlocking", async () => {
    await loadAndUnlock(stakeConnection, owner, new BN(50));
    await assertVoterWeightEquals(stakeConnection, owner, 50);

    // end the epoch so that the tokens start unlocking
    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);
    await assertVoterWeightEquals(stakeConnection, owner, 0);

    await stakeConnection.depositAndLockTokens(res[0], new BN(100));

    await assertVoterWeightEquals(stakeConnection, owner, 0);

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();

    await assertVoterWeightEquals(stakeConnection, owner, 100);

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(3)))
      .rpc();

    await assertVoterWeightEquals(stakeConnection, owner, 100);
  });

  after(async () => {
    controller.abort();
  });
});
