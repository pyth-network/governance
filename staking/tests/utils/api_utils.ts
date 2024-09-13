import { StakeConnection } from "../../app/StakeConnection";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";
import { PythBalance } from "../../app";
import {
  Proposal,
  getGovernanceSchemaForAccount,
  GovernanceAccountType,
  ProposalState,
  BN_ZERO,
  VoteType,
  InstructionExecutionFlags,
  SYSTEM_PROGRAM_ID,
  VoteThresholdType,
  VoteThreshold,
  VoteTypeKind,
} from "@solana/spl-governance";
import { serialize, BinaryWriter } from "borsh";
import * as wasm from "@pythnetwork/staking-wasm";
/**
 * Like BalanceSummary, but all fields are optional. If they aren't given, it's equivalent to them being specified as 0.
 */
export type OptionalBalanceSummary = {
  unvested?: {
    locked?: PythBalance | null;
    locking?: PythBalance | null;
    preunlocking?: PythBalance | null;
    unlocking?: PythBalance | null;
    unlocked?: PythBalance | null;
  } | null;
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
    actual.withdrawable.toString(),
    expected.withdrawable?.toString() || "0",
    "Withdrawable"
  );
  const expectedUnvestedLocking =
    expected.unvested?.locking ?? PythBalance.zero();
  const expectedUnvestedLocked =
    expected.unvested?.locked ?? PythBalance.zero();
  const expectedUnvestedPreunlocking =
    expected.unvested?.preunlocking ?? PythBalance.zero();
  const expectedUnvestedUnlocking =
    expected.unvested?.unlocking ?? PythBalance.zero();
  const expectedUnvestedUnlocked =
    expected.unvested?.unlocked ?? PythBalance.zero();
  const expectedUnvestedTotal = expectedUnvestedLocking
    .add(expectedUnvestedLocked)
    .add(expectedUnvestedPreunlocking)
    .add(expectedUnvestedUnlocking)
    .add(expectedUnvestedUnlocked);
  assert.equal(
    actual.unvested.total.toString(),
    expectedUnvestedTotal.toString(),
    "UnvestedTotal"
  );
  assert.equal(
    actual.unvested.locking.toString(),
    expectedUnvestedLocking.toString(),
    "UnvestedLocking"
  );
  assert.equal(
    actual.unvested.locked.toString(),
    expectedUnvestedLocked.toString(),
    "UnvestedLocked"
  );

  assert.equal(
    actual.unvested.preunlocking.toString(),
    expectedUnvestedPreunlocking.toString(),
    "UnvestedPreunlocking"
  );
  assert.equal(
    actual.unvested.unlocking.toString(),
    expectedUnvestedUnlocking.toString(),
    "UnvestedUnlocking"
  );
  assert.equal(
    actual.unvested.unlocked.toString(),
    expectedUnvestedUnlocked.toString(),
    "UnvestedUnlocked"
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
    wasm.Constants.MAX_VOTER_WEIGHT().toString()
  );

  // First check expected matches the WASM-computed value
  let expectedScaled = new BN(0);
  if (expected.totalLockedBalance.toBN().gtn(0))
    expectedScaled = expected.rawVoterWeight
      .toBN()
      .mul(pythMintSupply)
      .div(expected.totalLockedBalance.toBN());
  const currentActual = await stakeAccount.getVoterWeight(time);
  assert.equal(currentActual.toBN().toString(), expectedScaled.toString());

  const proposalAddress =
    await new MockProposalCreator().getMockProposalWithTime(
      stakeConnection,
      time
    );

  const tx = new Transaction();
  const { voterWeightAccount } = await stakeConnection.withUpdateVoterWeight(
    tx.instructions,
    stakeAccount,
    { castVote: {} },
    proposalAddress
  );
  await stakeConnection.provider.sendAndConfirm(tx);

  const onChain = await stakeConnection.program.account.voterWeightRecord.fetch(
    voterWeightAccount
  );
  assert.equal(onChain.voterWeight.toString(), expectedScaled.toString());
  assert.equal(
    onChain.weightActionTarget.toBase58(),
    proposalAddress.toBase58()
  );
  assert.equal(onChain.governingTokenOwner.toBase58(), owner.toBase58());
  assert.equal(onChain.weightAction.toString(), { castVote: {} }.toString());
}
/* spl-governance adds a few methods to the prototype of BinaryWriter so that it can serialize
   and deserialize governance objects properly. I'm not sure if this is SPL-gov using undefined
   behavior or not, but it seems when we use BinaryWriter we don't get those methods. This is a
   cleaner way to get them.  Mostly taken from https://github.com/solana-labs/oyster/blob/main/
   packages/governance-sdk/src/governance/serialisation.ts */
class GovernanceBinaryWriter extends BinaryWriter {
  writePubkey(value: PublicKey) {
    const writer = this as unknown as BinaryWriter;
    writer.writeFixedArray(value.toBuffer());
  }
  writeVoteType(value: VoteType) {
    const writer = this as unknown as BinaryWriter;
    writer.maybeResize();
    writer.buf.writeUInt8(value.type, writer.length);
    writer.length += 1;

    if (value.type === VoteTypeKind.MultiChoice) {
      writer.buf.writeUInt16LE(value.choiceCount!, writer.length);
      writer.length += 2;
    }
  }
  writeU16(value: number) {
    const writer = this as unknown as BinaryWriter;
    writer.maybeResize();
    writer.buf.writeUInt16LE(value, writer.length);
    writer.length += 2;
  }
  writeVoteThreshold(value: VoteThreshold) {
    const writer = this as unknown as BinaryWriter;
    writer.maybeResize();
    writer.buf.writeUInt8(value.type, writer.length);
    writer.length += 1;

    // Write value for VoteThresholds with u8 value
    if (
      value.type === VoteThresholdType.YesVotePercentage ||
      value.type === VoteThresholdType.QuorumPercentage
    ) {
      writer.buf.writeUInt8(value.value!, writer.length);
      writer.length += 1;
    }
  }
}

class MockProposalCreator {
  // Creating a mock proposal takes a few seconds, and we use a lot of the same times over and over,
  // so it makes sense to cache them
  static cache: Map<string, PublicKey> = new Map();

  public async getMockProposalWithTime(
    stakeConnection: StakeConnection,
    time: BN
  ) {
    if (MockProposalCreator.cache.has(time.toString())) {
      return MockProposalCreator.cache.get(time.toString());
    }
    const proposal = await this.createMockProposalWithTime(
      stakeConnection,
      time
    );
    MockProposalCreator.cache.set(time.toString(), proposal);
    return proposal;
  }

  async createMockProposalWithTime(
    stakeConnection: StakeConnection,
    time: BN
  ): Promise<PublicKey> {
    let proposal: Proposal = new Proposal({
      accountType: GovernanceAccountType.ProposalV2,
      governance: PublicKey.default,
      governingTokenMint: stakeConnection.config.pythTokenMint,
      state: ProposalState.Voting,
      tokenOwnerRecord: PublicKey.default,
      signatoriesCount: 0,
      signatoriesSignedOffCount: 0,
      descriptionLink: "Fake description",
      name: "Fake proposal",
      yesVotesCount: BN_ZERO,
      noVotesCount: BN_ZERO,
      instructionsExecutedCount: 0,
      instructionsCount: 0,
      instructionsNextIndex: 0,
      voteType: VoteType.SINGLE_CHOICE,
      options: [],
      denyVoteWeight: undefined,
      vetoVoteWeight: undefined,
      abstainVoteWeight: undefined,
      startVotingAt: null,
      maxVotingTime: null,
      draftAt: BN_ZERO,
      signingOffAt: null,
      votingAt: time, // The one field we care about
      votingAtSlot: null,
      votingCompletedAt: null,
      executingAt: null,
      closedAt: null,
      executionFlags: InstructionExecutionFlags.None,
      maxVoteWeight: null,
      voteThreshold: new VoteThreshold({
        type: VoteThresholdType.YesVotePercentage,
        value: 50,
      }),
      reserved1: 0,
    });
    (proposal as any).reserved = new Array(64); // Gross...
    const schema = getGovernanceSchemaForAccount(
      GovernanceAccountType.ProposalV2
    );

    const serializedProp = serialize(schema, proposal);
    const ixData = new BinaryWriter();
    // Add epoch duration to avoid negative seed
    const seed =
      time.toNumber() + stakeConnection.config.epochDuration.toNumber();
    ixData.writeU8(27); // The instruction index for HackCreateRawProposal
    ixData.writeU32(seed);
    ixData.writeFixedArray(serializedProp);

    const [acct, bump] = await PublicKey.findProgramAddress(
      [ixData.buf.subarray(1, 5)], // seed little endian bytes
      stakeConnection.governanceAddress
    );
    const tx = new Transaction();
    tx.add(
      new TransactionInstruction({
        programId: stakeConnection.governanceAddress,
        keys: [
          { pubkey: acct, isWritable: true, isSigner: false },
          {
            pubkey: stakeConnection.provider.wallet.publicKey,
            isWritable: true,
            isSigner: true,
          },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: ixData.buf.subarray(0, ixData.length),
      })
    );
    await stakeConnection.provider.sendAndConfirm(tx);

    return acct;
  }
}

export async function assertVoterWeightEquals(
  stakeConnection: StakeConnection,
  owner: PublicKey,
  expectedPrevEpoch: VoterWeights,
  expectedCurrentEpoch: VoterWeights
) {
  await assertVoterWeightEqualsAt(
    stakeConnection,
    owner,
    expectedPrevEpoch,
    (await stakeConnection.getTime()).sub(stakeConnection.config.epochDuration)
  );

  await assertVoterWeightEqualsAt(
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
