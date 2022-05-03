import { StakeConnection } from "../../app/StakeConnection";
import {
  BpfLoader,
  BPF_LOADER_PROGRAM_ID,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import assert from "assert";
import BN from "bn.js";
import { PythBalance } from "../../app";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  Proposal,
  getGovernanceSchemaForAccount,
  GovernanceAccountType,
  ProposalState,
  BN_ZERO,
  VoteType,
  InstructionExecutionFlags,
  VoteThresholdPercentage,
  VoteTypeKind,
} from "@solana/spl-governance";
import { serialize, BinaryWriter } from "borsh";

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

  const pythMintInfo = await new Token(
    stakeConnection.provider.connection,
    stakeConnection.config.pythTokenMint,
    TOKEN_PROGRAM_ID,
    new Keypair()
  ).getMintInfo();
  const pythMintSupply: BN = pythMintInfo.supply;

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
      votingAt: time,
      votingAtSlot: null,
      votingCompletedAt: null,
      executingAt: null,
      closedAt: null,
      executionFlags: InstructionExecutionFlags.None,
      maxVoteWeight: null,
      voteThresholdPercentage: new VoteThresholdPercentage({ value: 50 }),
    });
    (proposal as any).reserved = new Array(64); // Gross...
    const schema = getGovernanceSchemaForAccount(
      GovernanceAccountType.ProposalV2
    );
    const serializedProp = serialize(
      schema,
      proposal,
      this.GovernanceBinaryWriter
    );
    const sharedMemData = new BinaryWriter();
    sharedMemData.writeU64(0); // Offset
    sharedMemData.writeFixedArray(serializedProp);

    // BpfLoader.load requires the fee payer to be a Keypair, so we need to transfer some Sol to a new fee-payer
    const feePayer = Keypair.generate();
    const tx1 = new Transaction();
    tx1.add(
      SystemProgram.transfer({
        fromPubkey: stakeConnection.provider.wallet.publicKey,
        toPubkey: feePayer.publicKey,
        lamports: LAMPORTS_PER_SOL,
      })
    );
    await stakeConnection.provider.sendAndConfirm(tx1);

    const proposalAddress = Keypair.generate();
    try {
      await BpfLoader.load(
        stakeConnection.provider.connection,
        feePayer,
        proposalAddress,
        serializedProp,
        BPF_LOADER_PROGRAM_ID
      );
    } catch (error) {
      // This fails because it's not an ELF, but at that point it has already populated the account.
      // Gross, but I think this is the easiest way
    }
    return proposalAddress.publicKey;
  }
  // Uggh gross. In order to serialize this, we need to take a few functions from various parts of the governance API package
  GovernanceBinaryWriter = class extends BinaryWriter {
    writePubkey(value: PublicKey) {
      this.maybeResize();
      this.writeFixedArray(value.toBuffer());
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
  };
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
