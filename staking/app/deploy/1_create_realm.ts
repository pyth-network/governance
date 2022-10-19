import {
  GoverningTokenType,
  MintMaxVoteWeightSource,
  PROGRAM_VERSION_V2,
  withCreateRealm,
} from "@solana/spl-governance";
import { Transaction, Connection } from "@solana/web3.js";
import { BN } from "bn.js";

import {
  AUTHORITY_KEYPAIR,
  PYTH_TOKEN,
  STAKING_PROGRAM,
  GOVERNANCE_PROGRAM,
  RPC_NODE,
} from "./mainnet_beta";

import { Constants } from "pyth-staking-wasm";
// Actual transaction hash :
// mainnet-beta : 3es1jwFLTwMBSSyVyRJ6kcJK9MmYgoJxBqBLVv6D8iKYJ1Jj2jQ9UA24ZDnJ1jqU3BVvLGMifgaGdhnhsturdtTF

async function main() {
  const tx = new Transaction();

  await withCreateRealm(
    tx.instructions,
    GOVERNANCE_PROGRAM, // Address of the governance program
    PROGRAM_VERSION_V2, // Version of the on-chain governance program
    "Pyth Governance", // `name` of the realm
    AUTHORITY_KEYPAIR.publicKey, // Address of the realm authority
    PYTH_TOKEN, // Address of the Pyth token
    AUTHORITY_KEYPAIR.publicKey, // Address of the payer
    undefined, // No council mint
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION, // Irrelevant because we use the max voter weight plugin
    new BN(
      Constants.MAX_VOTER_WEIGHT().toString() // Create governance requires realm authority
    ),
    {
      voterWeightAddin: STAKING_PROGRAM, // Voter weight plugin
      maxVoterWeightAddin: STAKING_PROGRAM, // Max voter weight plugin
      tokenType: GoverningTokenType.Liquid, // Liquid token
    },
    undefined // No council mint
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
