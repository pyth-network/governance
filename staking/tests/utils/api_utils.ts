import { StakeConnection, BalanceSummary } from "../../app/StakeConnection";
import { PublicKey, Transaction } from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";
import { PythBalance } from "../../app";
import * as wasm from "../../wasm/node/staking";
import * as anchor from "@project-serum/anchor";
import { getMint } from "@solana/spl-token";
import * as gov from "@solana/spl-governance";

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
  rawVoterWeight: PythBalance;
  totalLockedBalance: PythBalance;
};

async function assertVoterWeightEqualsAt(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expected: VoterWeights,
  time: BN
) {
  const stakeAccount = await stakeConnection.getMainAccount(owner);
  const pythMintSupply: BN = new BN(
    (
      await getMint(
        stakeConnection.provider.connection,
        stakeConnection.config.pythTokenMint
      )
    ).supply.toString()
  );

  // First check expected matches the WASM-computed value
  const currentActual = stakeAccount.getVoterWeight(time);
  let expectedScaled = new BN(0);
  if (expected.totalLockedBalance.toBN().gtn(0))
    expectedScaled = expected.rawVoterWeight
      .toBN()
      .mul(pythMintSupply)
      .div(expected.totalLockedBalance.toBN());
  assert.equal(currentActual.toBN().toString(), expectedScaled.toString());

  // Now create a fake proposal, update the voter weight, and make sure the voter record matches expected
  const tx = new Transaction();
  const fns = gov.getGovernanceSchemaForAccount(
    gov.GovernanceAccountType.GovernanceV2
  );
  console.dir(fns);
}

export async function assertVoterWeightEquals(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expectedPrevEpoch: VoterWeights,
  expectedCurrentEpoch: VoterWeights
) {
  assertVoterWeightEqualsAt(
    stakeConnection,
    owner,
    expectedPrevEpoch,
    (await stakeConnection.getTime()).sub(stakeConnection.config.epochDuration)
  );
  assertVoterWeightEqualsAt(
    stakeConnection,
    owner,
    expectedCurrentEpoch,
    await stakeConnection.getTime()
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
