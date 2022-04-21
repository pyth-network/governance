import * as anchor from "@project-serum/anchor";
import { AnchorError, parseIdlErrors, Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SimulatedTransactionResponse,
} from "@solana/web3.js";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../wasm/node/staking";
import path from "path";
import {
  readAnchorConfig,
  ANCHOR_CONFIG_PATH,
  standardSetup,
  getPortNumber,
  AnchorConfig,
  makeDefaultConfig,
  CustomAbortController,
} from "./utils/before";
import { StakeConnection, PythBalance } from "../app";
import { GlobalConfig } from "../app/StakeConnection";
import {
  getProposal,
  getProposalsByGovernance,
  PROGRAM_VERSION_V2,
  Vote,
  VoteChoice,
  VoteKind,
  VoteType,
  withCastVote,
  withCreateProposal,
  withCreateTokenOwnerRecord,
  withSignOffProposal,
  YesNoVote,
} from "@solana/spl-governance";
import { program } from "@project-serum/anchor/dist/cjs/spl/token";
import { expectFail, expectFailApi } from "./utils/utils";
import { SuccessfulTxSimulationResponse } from "@project-serum/anchor/dist/cjs/utils/rpc";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("voting", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let governanceProgram: PublicKey;
  let realm: PublicKey;
  let governance: PublicKey;

  let stakeAccountAddress: PublicKey;

  let owner: PublicKey;
  let voterWeightRecordAccount: PublicKey;
  let tokenOwnerRecord: PublicKey;
  let provider: anchor.AnchorProvider;

  after(async () => {
    controller.abort();
  });

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    governanceProgram = new PublicKey(config.programs.localnet.governance);

    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));
    const globalConfig = stakeConnection.config;

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    provider = stakeConnection.provider;
    owner = provider.wallet.publicKey;
    realm = globalConfig.pythGovernanceRealm;
    governance = globalConfig.governanceAuthority;

    // Create stake account
    await stakeConnection.depositTokens(undefined, PythBalance.fromString("1"));
    const stakeAccount = await stakeConnection.getMainAccount(owner);
    await stakeConnection.withdrawTokens(
      stakeAccount,
      PythBalance.fromString("1")
    );

    stakeAccountAddress = (await stakeConnection.getMainAccount(owner)).address;

    voterWeightRecordAccount = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
          stakeAccountAddress.toBuffer(),
        ],
        stakeConnection.program.programId
      )
    )[0];

    tokenOwnerRecord = await stakeConnection.getTokenOwnerRecordAddress(owner);
  });

  async function withDefaultCreateProposal(
    tx: anchor.web3.Transaction,
    updateFirst: boolean,
    signoff: boolean
  ): Promise<PublicKey> {
    if (updateFirst) {
      const stakeAccount = await stakeConnection.getMainAccount(owner);
      tx.instructions.push(
        await stakeConnection.program.methods
          .updateVoterWeight()
          .accounts({
            stakeAccountPositions: stakeAccount.address,
          })
          .instruction()
      );
    }
    const proposalNumber = (
      await getProposalsByGovernance(
        provider.connection,
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
      pythMintAccount.publicKey,
      owner,
      proposalNumber,
      VoteType.SINGLE_CHOICE,
      ["Yes", "No"],
      false,
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

  function withDefaultCastVote(
    tx: Transaction,
    proposalAddress: PublicKey
  ): Promise<PublicKey> {
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
      pythMintAccount.publicKey,
      new Vote({
        voteType: VoteKind.Approve,
        approveChoices: [
          new VoteChoice({ rank: 0, weightPercentage: 100 }),
          new VoteChoice({ rank: 0, weightPercentage: 0 }),
        ],
        deny: false,
      }),
      provider.wallet.publicKey,
      voterWeightRecordAccount,
      undefined
    );
  }

  it("tries to create a proposal without updating", async () => {
    const tx = new Transaction();
    await withDefaultCreateProposal(tx, false, false);
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );
  });

  it("updates voter weight", async () => {
    // Haven't locked anything, so no voter weight
    const tx = new Transaction();
    await withDefaultCreateProposal(tx, true, false);
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );
  });

  it("create a position and then create proposal", async () => {
    stakeConnection.depositAndLockTokens(
      await stakeConnection.getMainAccount(owner),
      PythBalance.fromString("200")
    );
    // Time hasn't passed yet, so still no weight
    const tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(tx, true, false);
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );

    await stakeConnection.program.methods
      .advanceClock(EPOCH_DURATION.muln(5))
      .accounts({})
      .rpc({ skipPreflight: DEBUG });

    // Now it should succeed
    await provider.sendAndConfirm(tx);
  });
  it("ensures voter weight expires", async () => {
    // Slot has probably already increased, but make extra sure by waiting one second
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(tx, false, false);
    await expectFailGovernance(
      provider.simulate(tx),
      "VoterWeightRecord expired"
    );
  });

  it("create proposal and vote on it", async () => {
    const tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(tx, true, true);
    const vote = await withDefaultCastVote(tx, proposalAddress);
    await provider.sendAndConfirm(tx);

    const proposal = await getProposal(provider.connection, proposalAddress);
    assert.equal(
      proposal.account.getYesVoteCount().toNumber(),
      PythBalance.fromString("200").toBN().toNumber()
    );
  });
});

async function expectFailGovernance(
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
