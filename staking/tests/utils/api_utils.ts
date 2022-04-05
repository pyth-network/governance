import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";

/**
 * Like BalanceSummary, but all fields are optional. If they aren't given, it's equivalent to them being specified as 0.
 */
export type OptionalBalanceSummary = {
  unvested?: BN | null;
  withdrawable?: BN | null;
  locked?: {
    locking?: BN | null;
    locked?: BN | null;
    unlocking?: BN | null;
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
  assert.equal(
    actual.locked.locking.toNumber(),
    expected.locked?.locking?.toNumber() || 0
  );
  assert.equal(
    actual.locked.locked.toNumber(),
    expected.locked?.locked?.toNumber() || 0
  );
  assert.equal(
    actual.locked.unlocking.toNumber(),
    expected.locked?.unlocking?.toNumber() || 0
  );
  assert.equal(actual.unvested.toNumber(), expected.unvested?.toNumber() || 0);
  assert.equal(
    actual.withdrawable.toNumber(),
    expected.withdrawable?.toNumber() || 0
  );
}

export async function loadAndUnlock(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  amount: BN
) {
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  await stakeConnection.unlockTokens(res[0], amount);
}
