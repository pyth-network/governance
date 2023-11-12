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
import { Constants } from "@pythnetwork/staking-wasm";
import { AUTHORITY_KEYPAIR, RPC_NODE } from "./devnet";

import {
  GOVERNANCE_ADDRESS,
  REALM_ID,
  EPOCH_DURATION,
  STAKING_ADDRESS,
} from "../constants";
// Actual transaction hash :
// mainnet-beta : vjUE28suh1yt42aRtsj8mwYpz4zM17WQo4ujfXCDGQ5WK1z5G2JATYvEduh1vdMt2pT9auVLJnoCQMtiyEP3aYC
// devnet (12/11/23): 2N1w4WGrLGsbcTre7yfpNw6FbD2X3uDpmCd3DVPyNv95jLwjt1vDFqdpcEGM9PMXj7RQgW7fJovWd7RHaouFYbmL

async function main() {
  const tx = new Transaction();

  let governanceConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 10, // 10%
    }),
    minCommunityTokensToCreateProposal: new BN(
      Constants.MAX_VOTER_WEIGHT().toString()
    ).div(new BN(100)), // 1% of the locked supply
    minInstructionHoldUpTime: 0, // 0 seconds
    baseVotingTime: EPOCH_DURATION, // Is equal to 1 Pyth epoch
    communityVoteTipping: VoteTipping.Strict,
    minCouncilTokensToCreateProposal: new BN(1), // Not used since we don't have a council

    // V3
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.Disabled,
    }),
    councilVoteTipping: VoteTipping.Strict, // Not used since we don't have a council
    votingCoolOffTime: 0,
    depositExemptProposalCount: 100,
  });

  await withCreateProgramGovernance(
    tx.instructions,
    GOVERNANCE_ADDRESS(), // Address of our instance of the governance program
    PROGRAM_VERSION, // Version of the on-chain program
    REALM_ID, // Address of the Pyth realm
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
