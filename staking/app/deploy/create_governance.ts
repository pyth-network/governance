import {
  PROGRAM_VERSION_V2,
  withCreateGovernance,
  GovernanceConfig,
  VoteThresholdPercentage,
  VoteTipping,
} from "@solana/spl-governance";
import { Transaction, Connection, PublicKey } from "@solana/web3.js";
import { PythBalance } from "..";
import {
  AUTHORITY_KEYPAIR,
  GOVERNANCE_PROGRAM,
  RPC_NODE,
  REALM,
} from "./devnet";
import { BN } from "bn.js";

async function main() {
  const tx = new Transaction();

  const governanceConfig = new GovernanceConfig({
    voteThresholdPercentage: new VoteThresholdPercentage({ value: 50 }),
    minCommunityTokensToCreateProposal:
      PythBalance.fromString("100000000").toBN(),
    minInstructionHoldUpTime: 0,
    maxVotingTime: 3600,
    voteTipping: VoteTipping.Disabled,
    minCouncilTokensToCreateProposal: new BN(1),
  });

  await withCreateGovernance(
    tx.instructions,
    GOVERNANCE_PROGRAM,
    PROGRAM_VERSION_V2,
    REALM,
    undefined,
    governanceConfig,
    new PublicKey(0),
    AUTHORITY_KEYPAIR.publicKey,
    AUTHORITY_KEYPAIR.publicKey
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
