import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";
import { PythBalance } from "../../app";

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
  assert(
    actual.locked.locking.eq(
      expected.locked?.locking || PythBalance.fromString("0")
    )
  );
  assert(
    actual.locked.locked.eq(
      expected.locked?.locked || PythBalance.fromString("0")
    )
  );
  assert(
    actual.locked.unlocking.eq(
      expected.locked?.unlocking || PythBalance.fromString("0")
    )
  );
  assert(actual.unvested.eq(expected.unvested || PythBalance.fromString("0")));
  assert(
    actual.withdrawable.eq(expected.withdrawable || PythBalance.fromString("0"))
  );
}

export async function assertVoterWeightEquals(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expected: PythBalance
) {
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  const actual = res[0].getVoterWeight(await stakeConnection.getTime());
  assert(actual.eq(expected));
}

export async function loadAndUnlock(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  amount: PythBalance
) {
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  await stakeConnection.unlockTokens(res[0], amount);
}
