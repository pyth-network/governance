import {
  PROGRAM_VERSION_V2,
  withCreateGovernance,
  GovernanceConfig,
  VoteTipping,
  VoteThreshold,
  VoteThresholdType,
} from "@solana/spl-governance";
import { Transaction, Connection, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Constants } from "pyth-staking-wasm";
import {
  EPOCH_DURATION,
  AUTHORITY_KEYPAIR,
  RPC_NODE,
  REALM,
} from "./mainnet_beta";

import { GOVERNANCE_ADDRESS } from "../constants";
// Actual transaction hash :
// mainnet-beta : vjUE28suh1yt42aRtsj8mwYpz4zM17WQo4ujfXCDGQ5WK1z5G2JATYvEduh1vdMt2pT9auVLJnoCQMtiyEP3aYC
async function main() {
  const tx = new Transaction();

  let governanceConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 50,
    }), // 50% of the locked supply
    minCommunityTokensToCreateProposal: new BN(
      Constants.MAX_VOTER_WEIGHT().toString()
    ).div(new BN(100)), // 1% of the locked supply
    minInstructionHoldUpTime: 0, // 0 seconds
    maxVotingTime: EPOCH_DURATION, // Is equal to 1 Pyth epoch
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 0,
    }), // Maps into `proposal_cool_off_time`, needs to be 0 in PROGRAM_VERSION_V2
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 0,
    }), // Maps into `proposal_cool_off_time`, needs to be 0 in PROGRAM_VERSION_V2
    minCouncilTokensToCreateProposal: new BN(1), // Should never be used because we don't have a council mint
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 0,
    }), // Not used in PROGRAM_VERSION_V2
    councilVoteTipping: VoteTipping.Strict, // Not used in PROGRAM_VERSION_V2
  });

  await withCreateGovernance(
    tx.instructions,
    GOVERNANCE_ADDRESS(), // Address of our instance of the governance program
    PROGRAM_VERSION_V2, // Version of the onchain program
    REALM, // Address of the Pyth realms
    undefined, // This is a generic governance so no initial governed account
    governanceConfig,
    new PublicKey(0), // The realm authority is creating it, so this doesn't need to be defined
    AUTHORITY_KEYPAIR.publicKey, // Payer address
    AUTHORITY_KEYPAIR.publicKey // Realm authority
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
