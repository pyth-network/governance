import * as anchor from "@project-serum/anchor";
import { parseIdlErrors, Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
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
  let controller: AbortController;

  let governanceProgram: PublicKey;
  let realm: PublicKey;
  let governance: PublicKey;

  let stakeAccountAddress: PublicKey;

  let owner: PublicKey;
  let voterWeightRecordAccount: PublicKey;
  let tokenOwnerRecord: PublicKey;
  let provider: anchor.Provider;

  after(async () => {
    controller.abort();
  });

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    governanceProgram = new PublicKey(config.programs.localnet.governance);
    let globalConfig: GlobalConfig;
    ({ controller, stakeConnection, globalConfig } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    provider = stakeConnection.program.provider;
    owner = provider.wallet.publicKey;
    realm = globalConfig.pythGovernanceRealm;
    governance = globalConfig.governanceAuthority;

    // Create stake account
    await stakeConnection.depositTokens(undefined, PythBalance.fromString("1"));
    const accounts = await stakeConnection.getStakeAccounts(owner);
    await stakeConnection.withdrawTokens(
      accounts[0],
      PythBalance.fromString("1")
    );

    stakeAccountAddress = (await stakeConnection.getStakeAccounts(owner))[0]
      .address;

    voterWeightRecordAccount = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
          stakeAccountAddress.toBuffer(),
        ],
        stakeConnection.program.programId
      )
    )[0];
  });
  it("creates token owner record", async () => {
    const tx = new Transaction();
    tokenOwnerRecord = await withCreateTokenOwnerRecord(
      tx.instructions,
      governanceProgram,
      realm,
      owner,
      pythMintAccount.publicKey,
      owner
    );
    await provider.send(tx);
  });

  async function withDefaultCreateProposal(
    tx: anchor.web3.Transaction,
    updateFirst: boolean,
    signoff: boolean
  ): Promise<PublicKey> {
    if (updateFirst) {
      const accounts = await stakeConnection.getStakeAccounts(owner);
      tx.instructions.push(
        await stakeConnection.program.methods
          .updateVoterWeight()
          .accounts({
            stakeAccountPositions: accounts[0].address,
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
      (await stakeConnection.getStakeAccounts(owner))[0],
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
      .accounts()
      .rpc({ skipPreflight: DEBUG });

    // Now it should succeed
    await provider.send(tx);
  });
  it("ensures voter weight expires", async () => {
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
    try {
      await provider.send(tx);
    } catch (e) {
      console.log(e);
      while (true) {}
    }
    const proposal = await getProposal(provider.connection, proposalAddress);
    assert.equal(
      proposal.account.getYesVoteCount().toNumber(),
      PythBalance.fromString("200").toBN().toNumber()
    );
  });
});

async function expectFailGovernance(
  tx: Promise<
    anchor.web3.RpcResponseAndContext<anchor.web3.SimulatedTransactionResponse>
  >,
  expectedError: string
) {
  const response = await tx;
  if (response.value.err == null)
    throw new Error("Function that was expected to fail succeeded");
  const errors = response.value.logs.filter((line) =>
    line.includes("GOVERNANCE-ERROR")
  );
  if (!errors.some((line) => line.includes(expectedError))) {
    assert.equal(errors.join("\n"), expectedError);
  }
}
