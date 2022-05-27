import * as anchor from "@project-serum/anchor";
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
import { expectFail } from "./utils/utils";
import {
  readAnchorConfig,
  ANCHOR_CONFIG_PATH,
  standardSetup,
  getPortNumber,
  makeDefaultConfig,
  CustomAbortController,
} from "./utils/before";
import { StakeConnection, PythBalance } from "../app";
import { getProposal } from "@solana/spl-governance";
import { SuccessfulTxSimulationResponse } from "@project-serum/anchor/dist/cjs/utils/rpc";
import { parseIdlErrors } from "@project-serum/anchor";
import {
  withDefaultCreateProposal,
  syncronizeClock,
  withDefaultCastVote,
} from "./utils/governance_utils";

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

    let defaultConfig = makeDefaultConfig(pythMintAccount.publicKey);
    defaultConfig.epochDuration = new BN(5);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      defaultConfig
    ));

    // Delete the property, which will make the API think it's not using mock clock anymore
    delete stakeConnection.config.mockClockTime;
    await syncronizeClock(stakeConnection);

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

  it("tries to create a proposal without updating", async () => {
    const tx = new Transaction();
    await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      false,
      false
    );
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );
  });

  it("updates voter weight", async () => {
    // Haven't locked anything, so no voter weight
    const tx = new Transaction();
    await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      true,
      false
    );
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );
  });

  it("create a position and then create proposal", async () => {
    await stakeConnection.depositAndLockTokens(
      await stakeConnection.getMainAccount(owner),
      PythBalance.fromString("200")
    );
    // Time hasn't passed yet, so still no weight
    const tx = new Transaction();
    await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      true,
      false
    );
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );

    await new Promise((resolve) =>
      setTimeout(resolve, EPOCH_DURATION.toNumber() * 1000)
    );
    await syncronizeClock(stakeConnection);

    // Now it should succeed
    await provider.sendAndConfirm(tx);
  });
  it("ensures voter weight expires", async () => {
    // Slot has probably already increased, but make extra sure by waiting one second
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const tx = new Transaction();
    await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      false,
      false
    );
    await expectFailGovernance(
      provider.simulate(tx),
      "VoterWeightRecord expired"
    );
  });

  it("create proposal and vote on it", async () => {
    let tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      true,
      true
    );
    await withDefaultCastVote(
      tx,
      realm,
      governanceProgram,
      governance,
      proposalAddress,
      stakeConnection,
      false
    );

    await syncronizeClock(stakeConnection);
    await provider.sendAndConfirm(tx);

    const proposal = await getProposal(provider.connection, proposalAddress);
    assert.equal(
      proposal.account.getYesVoteCount().toNumber(),
      PythBalance.fromString("200").toBN().toNumber()
    );
  });

  it("another proposal, this time we update voter weight for the wrong action", async () => {
    let tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      true,
      true
    );
    await withDefaultCastVote(
      tx,
      realm,
      governanceProgram,
      governance,
      proposalAddress,
      stakeConnection,
      true
    );
    await expectFailGovernance(
      provider.simulate(tx),
      "VoterWeightRecord invalid action"
    );
  });

  it("another proposal, wait a long time, voting should fail", async () => {
    let tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      stakeConnection,
      true,
      true
    );
    await provider.sendAndConfirm(tx);

    await new Promise((resolve) =>
      setTimeout(resolve, EPOCH_DURATION.toNumber() * 3000)
    );
    await syncronizeClock(stakeConnection);

    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await expectFail(
      stakeConnection.program.methods
        .updateVoterWeight({ castVote: {} })
        .accounts({
          stakeAccountPositions: stakeAccount.address,
        })
        .remainingAccounts([
          { pubkey: proposalAddress, isWritable: false, isSigner: false },
        ]),
      "Voting epoch is either too old or hasn't started",
      parseIdlErrors(stakeConnection.program.idl)
    );

    await expectFail(
      stakeConnection.program.methods
        .updateVoterWeight({ castVote: {} })
        .accounts({
          stakeAccountPositions: stakeAccount.address,
        })
        .remainingAccounts([]),
      "Extra governance account required",
      parseIdlErrors(stakeConnection.program.idl)
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
