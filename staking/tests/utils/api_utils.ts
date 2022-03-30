import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";

/**
 * Like BalanceSummary, but all fields are optional. If they aren't given, it's equivalent to them being specified as 0.
 */
export type OptionalBalanceSummary = {
  unvested?: number | null;
  withdrawable?: number | null;
  locked?: {
    locking?: number | null;
    locked?: number | null;
    unlocking?: number | null;
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
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  const actual = res[0].getBalanceSummary(currentTime);
  assert.equal(actual.locked.locking, expected.locked?.locking || 0);
  assert.equal(actual.locked.locked, expected.locked?.locked || 0);
  assert.equal(actual.locked.unlocking, expected.locked?.unlocking || 0);
  assert.equal(actual.unvested, expected.unvested || 0);
  assert.equal(
    actual.withdrawable,
    expected.withdrawable || 0
  );
}

export async function loadAndUnlock(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  amount: number
) {
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  await stakeConnection.unlockTokens(res[0], amount);
}
