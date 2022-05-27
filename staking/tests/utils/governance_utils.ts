import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  Transaction,
  SimulatedTransactionResponse,
} from "@solana/web3.js";
import * as wasm from "../../wasm/node/staking";
import { StakeConnection } from "../../app";
import {
  getProposalsByGovernance,
  PROGRAM_VERSION_V2,
  Vote,
  VoteChoice,
  VoteKind,
  VoteType,
  withCastVote,
  withCreateProposal,
  withSignOffProposal,
} from "@solana/spl-governance";
import { SuccessfulTxSimulationResponse } from "@project-serum/anchor/dist/cjs/utils/rpc";
import assert from "assert";

async function computeGovernanceAccounts(stakeConnection: StakeConnection) {
  const maxVoterWeightRecordAccount = (
    await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode(wasm.Constants.MAX_VOTER_RECORD_SEED())],
      stakeConnection.program.programId
    )
  )[0];

  const owner = stakeConnection.provider.wallet.publicKey;
  const stakeAccountAddress = (await stakeConnection.getMainAccount(owner))
    .address;
  const voterWeightRecordAccount = (
    await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
        stakeAccountAddress.toBuffer(),
      ],
      stakeConnection.program.programId
    )
  )[0];
  const tokenOwnerRecord = await stakeConnection.getTokenOwnerRecordAddress(
    owner
  );

  return {
    owner,
    maxVoterWeightRecordAccount,
    voterWeightRecordAccount,
    tokenOwnerRecord,
  };
}

export async function withDefaultCreateProposal(
  tx: anchor.web3.Transaction,
  realm: PublicKey,
  governanceProgram: PublicKey,
  governance: PublicKey,
  stakeConnection: StakeConnection,
  updateFirst: boolean,
  signoff: boolean
): Promise<PublicKey> {
  const { owner, voterWeightRecordAccount, tokenOwnerRecord } =
    await computeGovernanceAccounts(stakeConnection);

  if (updateFirst) {
    const stakeAccount = await stakeConnection.getMainAccount(owner);
    stakeConnection.withUpdateVoterWeight(tx.instructions, stakeAccount, {
      createProposal: {},
    });
  }
  const proposalNumber = (
    await getProposalsByGovernance(
      stakeConnection.provider.connection,
      governanceProgram,
      governance
    )
  ).length;
  const proposal = await withCreateProposal(
    tx.instructions,
    governanceProgram,
    PROGRAM_VERSION_V2,
    realm,
    governance,
    tokenOwnerRecord,
    "Test proposal " + proposalNumber,
    "www.example.com",
    stakeConnection.config.pythTokenMint,
    owner,
    proposalNumber,
    VoteType.SINGLE_CHOICE,
    ["Yes"],
    true,
    owner,
    voterWeightRecordAccount
  );
  if (signoff) {
    withSignOffProposal(
      tx.instructions,
      governanceProgram,
      PROGRAM_VERSION_V2,
      realm,
      governance,
      proposal,
      owner,
      tokenOwnerRecord,
      tokenOwnerRecord
    );
  }

  return proposal;
}

export async function withDefaultCastVote(
  tx: Transaction,
  realm: PublicKey,
  governanceProgram: PublicKey,
  governance: PublicKey,
  proposalAddress: PublicKey,
  stakeConnection: StakeConnection,
  wrongArgument = false
): Promise<PublicKey> {
  const {
    owner,
    voterWeightRecordAccount,
    tokenOwnerRecord,
    maxVoterWeightRecordAccount,
  } = await computeGovernanceAccounts(stakeConnection);

  const stakeAccount = await stakeConnection.getMainAccount(owner);
  tx.instructions.push(
    await stakeConnection.program.methods
      .updateVoterWeight(
        wrongArgument ? { createProposal: {} } : { castVote: {} }
      )
      .accounts({
        stakeAccountPositions: stakeAccount.address,
      })
      .remainingAccounts([
        { pubkey: proposalAddress, isWritable: false, isSigner: false },
      ])
      .instruction()
  );

  return withCastVote(
    tx.instructions,
    governanceProgram,
    PROGRAM_VERSION_V2,
    realm,
    governance,
    proposalAddress,
    tokenOwnerRecord,
    tokenOwnerRecord,
    owner,
    stakeConnection.config.pythTokenMint,
    new Vote({
      voteType: VoteKind.Approve,
      approveChoices: [new VoteChoice({ rank: 0, weightPercentage: 100 })],
      deny: false,
    }),
    stakeConnection.provider.wallet.publicKey,
    voterWeightRecordAccount,
    maxVoterWeightRecordAccount
  );
}

export async function syncronizeClock(stakeConnection: StakeConnection) {
  const time = await stakeConnection.getTime();
  const mock_clock_time = (
    await stakeConnection.program.account.globalConfig.fetch(
      stakeConnection.configAddress
    )
  ).mockClockTime;
  await stakeConnection.program.methods
    .advanceClock(time.sub(mock_clock_time))
    .accounts({})
    .rpc();
}

export async function expectFailGovernance(
  tx: Promise<SuccessfulTxSimulationResponse>,
  expectedError: string
) {
  try {
    const response = await tx;
    throw new Error("Function that was expected to fail succeeded");
  } catch (error) {
    // Anchor probable should export this type but doesn't
    if (error.hasOwnProperty("simulationResponse")) {
      const logs = (error.simulationResponse as SimulatedTransactionResponse)
        .logs;
      const errors = logs.filter((line) => line.includes("GOVERNANCE-ERROR"));
      if (!errors.some((line) => line.includes(expectedError))) {
        assert.equal(errors.join("\n"), expectedError);
      }
    } else {
      console.dir(error);
      throw error;
    }
  }
}
