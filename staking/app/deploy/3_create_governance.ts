import {
  GovernanceConfig,
  VoteTipping,
  VoteThreshold,
  VoteThresholdType,
  withCreateProgramGovernance,
  PROGRAM_VERSION,
} from "@solana/spl-governance";
import { Transaction, Connection, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Constants } from "pyth-staking-wasm";
import { AUTHORITY_KEYPAIR, RPC_NODE } from "./devnet";

import {
  GOVERNANCE_ADDRESS,
  REALM_ID,
  EPOCH_DURATION,
  STAKING_ADDRESS,
} from "../constants";
// Actual transaction hash :
// mainnet-beta : vjUE28suh1yt42aRtsj8mwYpz4zM17WQo4ujfXCDGQ5WK1z5G2JATYvEduh1vdMt2pT9auVLJnoCQMtiyEP3aYC
// devnet : 3gKKKPGAfV15yV1Ce6Tn9vmwbeRnMHcyrvDxDpPhHAEr6L8VAe4N3rkNizhLGa7cM19xQaJykt6rxjx651fFRqXM

async function main() {
  console.log(AUTHORITY_KEYPAIR.publicKey.toBase58());
  const tx = new Transaction();

  let governanceConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 10,
    }),
    minCommunityTokensToCreateProposal: new BN(
      Constants.MAX_VOTER_WEIGHT().toString()
    ).div(new BN(100)), // 1% of the locked supply
    minInstructionHoldUpTime: 0, // 0 seconds
    baseVotingTime: EPOCH_DURATION, // Is equal to 1 Pyth epoch
    communityVoteTipping: VoteTipping.Strict,
    minCouncilTokensToCreateProposal: new BN(1), // Should never be used because we don't have a council mint

    // V3
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }), // Maps into `proposal_cool_off_time`, needs to be 0 in PROGRAM_VERSION_V2
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }), // Maps into `proposal_cool_off_time`, needs to be 0 in PROGRAM_VERSION_V2
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }), // Not used in PROGRAM_VERSION_V2
    councilVoteTipping: VoteTipping.Strict, // Not used in PROGRAM_VERSION_V2
    votingCoolOffTime: 0,
    depositExemptProposalCount: 100,
  });

  await withCreateProgramGovernance(
    tx.instructions,
    GOVERNANCE_ADDRESS(), // Address of our instance of the governance program
    PROGRAM_VERSION, // Version of the onchain program
    REALM_ID, // Address of the Pyth realms
    STAKING_ADDRESS, // Address of the staking program
    governanceConfig, // Governance config
    false, // Transfer upgrade authority
    AUTHORITY_KEYPAIR.publicKey, // Program authority
    new PublicKey(0), // The realm authority is creating it, so this doesn't need to be defined
    AUTHORITY_KEYPAIR.publicKey, // Payer address
    AUTHORITY_KEYPAIR.publicKey // Realm authority
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
