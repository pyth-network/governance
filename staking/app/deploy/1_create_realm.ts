import {
  GoverningTokenType,
  MintMaxVoteWeightSource,
  PROGRAM_VERSION,
  withCreateRealm,
} from "@solana/spl-governance";
import { Transaction, Connection } from "@solana/web3.js";
import { BN } from "bn.js";

import { AUTHORITY_KEYPAIR, PYTH_TOKEN, RPC_NODE } from "./devnet";
import { STAKING_ADDRESS, GOVERNANCE_ADDRESS } from "../constants";
// Actual transaction hash :
// mainnet-beta : 3es1jwFLTwMBSSyVyRJ6kcJK9MmYgoJxBqBLVv6D8iKYJ1Jj2jQ9UA24ZDnJ1jqU3BVvLGMifgaGdhnhsturdtTF
// devnet (10/12/23): ZoyuaKQbahuWcUkbvY4R5Cn8do8Ra1sjdKKHNQ3oVeorcn5xU7fz5uGKDAHAazD792LNytkeJz4cUu7eun8hrHr

async function main() {
  const tx = new Transaction();

  await withCreateRealm(
    tx.instructions,
    GOVERNANCE_ADDRESS(), // Address of the governance program
    PROGRAM_VERSION, // Version of the on-chain governance program
    "Pyth Governance", // `name` of the realm
    AUTHORITY_KEYPAIR.publicKey, // Address of the realm authority
    PYTH_TOKEN, // Address of the Pyth token
    AUTHORITY_KEYPAIR.publicKey, // Address of the payer
    undefined, // No council mint
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION, // Irrelevant because we use the max voter weight plugin
    new BN(
      "18446744073709551615" // u64::MAX
    ),
    {
      voterWeightAddin: STAKING_ADDRESS, // Voter weight plugin
      maxVoterWeightAddin: STAKING_ADDRESS, // Max voter weight plugin
      tokenType: GoverningTokenType.Dormant, // Users should never deposit tokens but instead use the staking program
    },
    undefined // No council mint
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
