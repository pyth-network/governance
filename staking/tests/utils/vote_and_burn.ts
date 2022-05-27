import * as anchor from "@project-serum/anchor";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import assert from "assert";
import path from "path";
import { expectFail } from "./utils/utils";
import { requestPythAirdrop } from "./utils/before";
import {
  readAnchorConfig,
  ANCHOR_CONFIG_PATH,
  standardSetup,
  getPortNumber,
  makeDefaultConfig,
  CustomAbortController,
} from "./utils/before";
import { StakeConnection, PythBalance } from "../app";
import { getProposal, ProposalState } from "@solana/spl-governance";
import {
  withDefaultCreateProposal,
  syncronizeClock,
  withDefaultCastVote,
  expectFailGovernance,
} from "./utils/governance_utils";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("voting_and_burning", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let governanceProgram: PublicKey;
  let realm: PublicKey;
  let governance: PublicKey;

  let owner: PublicKey;

  let attackerConnection: StakeConnection;

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

    owner = stakeConnection.provider.wallet.publicKey;
    realm = globalConfig.pythGovernanceRealm;
    governance = globalConfig.governanceAuthority;

    const attackerKeypair = new Keypair();

    attackerConnection = await StakeConnection.createStakeConnection(
      stakeConnection.program.provider.connection,
      new anchor.Wallet(attackerKeypair),
      stakeConnection.program.programId
    );

    const attacker = attackerKeypair.publicKey;

    await attackerConnection.program.provider.connection.requestAirdrop(
      attacker,
      1_000_000_000_000
    );

    await requestPythAirdrop(
      attacker,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("400"),
      stakeConnection.program.provider.connection
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await attackerConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("100")
    );
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("200")
    );
  });

  it("creates max voter weight record", async () => {
    await stakeConnection.program.methods
      .updateMaxVoterWeight()
      .accounts({})
      .rpc({ skipPreflight: DEBUG });
  });

  it("create proposal", async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, EPOCH_DURATION.toNumber() * 1000)
    );

    let tx = new Transaction();
    const proposalAddress = await withDefaultCreateProposal(
      tx,
      realm,
      governanceProgram,
      governance,
      attackerConnection,
      true,
      true
    );
    await withDefaultCastVote(
      tx,
      realm,
      governanceProgram,
      governance,
      proposalAddress,
      attackerConnection,
      false
    );

    await syncronizeClock(stakeConnection);

    await attackerConnection.provider.sendAndConfirm(tx);

    const proposal = await getProposal(
      attackerConnection.provider.connection,
      proposalAddress
    );
    console.log(proposal.account.getYesVoteCount().toString());
    console.log(proposal.account.maxVoteWeight.toString());
    assert.equal(proposal.account.state, ProposalState.Succeeded);
  });
});
