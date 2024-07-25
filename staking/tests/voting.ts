import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import assert from "assert";
import path from "path";
import { expectFail } from "./utils/utils";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
  withCreateDefaultGovernance,
} from "./utils/before";
import * as wasm from "@pythnetwork/staking-wasm";
import { StakeConnection, PythBalance } from "../app";
import {
  getProposal,
  ProposalState,
  tryGetRealmConfig,
} from "@solana/spl-governance";
import {
  withDefaultCreateProposal,
  syncronizeClock,
  withDefaultCastVote,
  expectFailGovernance,
  computeGovernanceAccounts,
} from "./utils/governance_utils";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("voting", async () => {
  let epochDuration: BN;
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;
  let realm: PublicKey;
  let governance: PublicKey;
  let owner: PublicKey;
  let provider: anchor.AnchorProvider;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));

    const globalConfig = stakeConnection.config;

    epochDuration = stakeConnection.config.epochDuration;

    provider = stakeConnection.provider;
    owner = provider.wallet.publicKey;
    realm = globalConfig.pythGovernanceRealm;
    governance = globalConfig.governanceAuthority;

    await syncronizeClock(realm, stakeConnection);

    // Create stake account
    await stakeConnection.depositTokens(undefined, PythBalance.fromString("1"));
    const stakeAccount = await stakeConnection.getMainAccount(owner);
    await stakeConnection.withdrawTokens(
      stakeAccount,
      PythBalance.fromString("1")
    );
  });

  it("check plugins are activated", async () => {
    const realmConfig = await tryGetRealmConfig(
      stakeConnection.provider.connection,
      stakeConnection.config.governanceProgram,
      realm
    );
    assert(
      realmConfig.account.communityTokenConfig.voterWeightAddin.toBase58(),
      stakeConnection.program.programId.toBase58()
    );
    assert(
      realmConfig.account.communityTokenConfig.maxVoterWeightAddin.toBase58(),
      stakeConnection.program.programId.toBase58()
    );
  });

  it("creates max voter weight record", async () => {
    await stakeConnection.program.methods
      .updateMaxVoterWeight()
      .accounts({})
      .rpc();

    const maxVoterWeightRecordAccount = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(
            wasm.Constants.MAX_VOTER_RECORD_SEED()
          ),
        ],
        stakeConnection.program.programId
      )
    )[0];

    const maxVoterWeightAccountData =
      await stakeConnection.program.account.maxVoterWeightRecord.fetch(
        maxVoterWeightRecordAccount
      );
    assert.equal(maxVoterWeightAccountData.maxVoterWeightExpiry, null);
    assert.equal(
      maxVoterWeightAccountData.maxVoterWeight.toString(),
      PythBalance.fromString("10000000000").toBN().toString()
    );
    assert.equal(maxVoterWeightAccountData.realm.toBase58(), realm.toBase58());
    assert.equal(
      maxVoterWeightAccountData.governingTokenMint.toBase58(),
      stakeConnection.config.pythTokenMint.toBase58()
    );
  });

  it("tries to create a proposal without updating", async () => {
    const tx = new Transaction();
    await withDefaultCreateProposal(
      tx,
      realm,
      stakeConnection.config.governanceProgram,
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
      stakeConnection.config.governanceProgram,
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
      stakeConnection.config.governanceProgram,
      governance,
      stakeConnection,
      true,
      false
    );
    await expectFailGovernance(
      provider.simulate(tx),
      "Owner doesn't have enough governing tokens to create Proposal"
    );

    await stakeConnection.program.methods
      .advanceClock(epochDuration)
      .accounts({})
      .rpc();
    await syncronizeClock(realm, stakeConnection);

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
      stakeConnection.config.governanceProgram,
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
      stakeConnection.config.governanceProgram,
      governance,
      stakeConnection,
      true,
      true
    );
    await withDefaultCastVote(
      tx,
      realm,
      stakeConnection.config.governanceProgram,
      governance,
      proposalAddress,
      stakeConnection,
      false
    );

    await syncronizeClock(realm, stakeConnection);
    await provider.sendAndConfirm(tx);

    const proposal = await getProposal(provider.connection, proposalAddress);
    assert.equal(
      proposal.account.getYesVoteCount().toString(),
      PythBalance.fromString("10000000000").toBN().toString()
    );
    assert.equal(proposal.account.state, ProposalState.Succeeded);
  });

  it("another proposal, this time we update voter weight for the wrong action", async () => {
    let tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(
      tx,
      realm,
      stakeConnection.config.governanceProgram,
      governance,
      stakeConnection,
      true,
      true
    );
    await withDefaultCastVote(
      tx,
      realm,
      stakeConnection.config.governanceProgram,
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
      stakeConnection.config.governanceProgram,
      governance,
      stakeConnection,
      true,
      true
    );
    await provider.sendAndConfirm(tx);

    await stakeConnection.program.methods
      .advanceClock(epochDuration.muln(3))
      .accounts({})
      .rpc();
    await syncronizeClock(realm, stakeConnection);

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
      "Voting epoch is either too old or hasn't started"
    );

    await expectFail(
      stakeConnection.program.methods
        .updateVoterWeight({ castVote: {} })
        .accounts({
          stakeAccountPositions: stakeAccount.address,
        })
        .remainingAccounts([]),
      "Extra governance account required"
    );
  });

  it("create governance with long proposals, fail to create a proposal", async () => {
    let tx = new Transaction();

    const stakeAccount = await stakeConnection.getMainAccount(owner);
    await stakeConnection.withUpdateVoterWeight(tx.instructions, stakeAccount, {
      createGovernance: {},
    });

    const { voterWeightRecordAccount, tokenOwnerRecord } =
      await computeGovernanceAccounts(stakeConnection);

    // 7200 > 3600, so no one should be able to create proposals
    const longGovernance = await withCreateDefaultGovernance(
      tx,
      7200,
      stakeConnection.config.governanceProgram,
      realm,
      tokenOwnerRecord,
      owner,
      owner,
      voterWeightRecordAccount
    );

    await expectFail(
      stakeConnection.program.methods
        .updateVoterWeight({ createProposal: {} })
        .accounts({
          stakeAccountPositions: stakeAccount.address,
        })
        .remainingAccounts([
          { pubkey: longGovernance, isWritable: false, isSigner: false },
        ])
        .preInstructions(tx.instructions),
      "Proposal too long"
    );
  });
});
