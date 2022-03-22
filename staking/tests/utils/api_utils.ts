import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";

export async function assertBalanceMatches(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expected: BalanceSummary,
  currentTime: BN
) {
  const res = await stakeConnection.getStakeAccounts(owner);
  assert.equal(res.length, 1);
  const actual = res[0].getBalanceSummary(currentTime);
  assert.equal(actual.locked.toNumber(), expected.locked.toNumber());
  assert.equal(actual.unvested.toNumber(), expected.unvested.toNumber());
  assert.equal(
    actual.withdrawable.toNumber(),
    expected.withdrawable.toNumber()
  );
}
