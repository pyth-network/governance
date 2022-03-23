import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";

/**
 * Asserts that `owner` has 1 single stake account and its balance summary is equal to an `expected` value
 */
export async function assertBalanceMatches(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expected: BalanceSummary,
  currentTime: BN
) {
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  const actual = res[0].getBalanceSummary(currentTime);
  assert.equal(actual.locked, expected.locked);
  assert.equal(actual.unvested, expected.unvested);
  assert.equal(
    actual.withdrawable,
    expected.withdrawable
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
