import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey, Transaction } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";
import { PythBalance } from "../../app";
import * as wasm from "../../wasm/node/staking";
import * as anchor from "@project-serum/anchor";

/**
 * Like BalanceSummary, but all fields are optional. If they aren't given, it's equivalent to them being specified as 0.
 */
export type OptionalBalanceSummary = {
  unvested?: PythBalance | null;
  withdrawable?: PythBalance | null;
  locked?: {
    locking?: PythBalance | null;
    locked?: PythBalance | null;
    unlocking?: PythBalance | null;
    preunlocking?: PythBalance | null;
  } | null;
};

/**
 * Asserts that `owner` has 1 single stake account and its balance summary is equal to an `expected` value
 */
export async function assertBalanceMatches(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expected: OptionalBalanceSummary,
  currentTime: BN
) {
  const stakeAccount = await stakeConnection.getMainAccount(owner);
  const actual = stakeAccount.getBalanceSummary(currentTime);
  // Comparison as string gives better error messages when a test fails
  assert.equal(
    actual.locked.locking.toString(),
    expected.locked?.locking?.toString() || "0",
    "Locking"
  );
  assert.equal(
    actual.locked.locked.toString(),
    expected.locked?.locked?.toString() || "0",
    "Locked"
  );
  assert.equal(
    actual.locked.preunlocking.toString(),
    expected.locked?.preunlocking?.toString() || "0",
    "Preunlocking"
  );
  assert.equal(
    actual.locked.unlocking.toString(),
    expected.locked?.unlocking?.toString() || "0",
    "Unlocking"
  );
  assert.equal(
    actual.unvested.toString(),
    expected.unvested?.toString() || "0",
    "Unvested"
  );
  assert.equal(
    actual.withdrawable.toString(),
    expected.withdrawable?.toString() || "0",
    "Withdrawable"
  );
}

export type VoterWeights = {
  voterWeight: PythBalance;
  maxVoterWeight: PythBalance;
};

export async function assertVoterWeightEquals(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expected: VoterWeights
) {
  const stakeAccount = await stakeConnection.getMainAccount(owner);
  const actual = stakeAccount.getVoterWeight(await stakeConnection.getTime());
  assert(actual.eq(expected.voterWeight));
  const tx = new Transaction();
  stakeConnection.withUpdateVoterWeight(tx.instructions, stakeAccount);
  await stakeConnection.program.provider.send(tx, []);

  let [voterAccount, voterBump] = await PublicKey.findProgramAddress(
    [
      anchor.utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
      stakeAccount.address.toBuffer(),
    ],
    stakeConnection.program.programId
  );

  const voterRecord =
    await stakeConnection.program.account.voterWeightRecord.fetch(voterAccount);
  assert(voterRecord.voterWeight.eq(expected.voterWeight.toBN()));

  let [maxVoterWeightAccount, maxVoterWeightBump] =
    await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode(wasm.Constants.MAX_VOTER_RECORD_SEED())],
      stakeConnection.program.programId
    );

  const maxVoterWeightRecord =
    await stakeConnection.program.account.maxVoterWeightRecord.fetch(
      maxVoterWeightAccount
    );
  assert(
    maxVoterWeightRecord.maxVoterWeight.eq(expected.maxVoterWeight.toBN())
  );
}

export async function loadAndUnlock(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  amount: PythBalance
) {
  const stakeAccount = await stakeConnection.getMainAccount(owner);
  await stakeConnection.unlockTokens(stakeAccount, amount);
}
