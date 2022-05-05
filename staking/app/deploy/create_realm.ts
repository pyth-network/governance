import {
  MintMaxVoteWeightSource,
  PROGRAM_VERSION_V2,
  withCreateRealm,
} from "@solana/spl-governance";
import { Transaction, Connection } from "@solana/web3.js";

import {
  AUTHORITY_KEYPAIR,
  PYTH_TOKEN,
  STAKING_PROGRAM,
  GOVERNANCE_PROGRAM,
  RPC_NODE,
} from "./devnet";

async function main() {
  const tx = new Transaction();
  await withCreateRealm(
    tx.instructions,
    GOVERNANCE_PROGRAM,
    PROGRAM_VERSION_V2,
    "Pyth Governance",
    AUTHORITY_KEYPAIR.publicKey,
    PYTH_TOKEN,
    AUTHORITY_KEYPAIR.publicKey,
    undefined, // no council mint
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    MintMaxVoteWeightSource.SUPPLY_FRACTION_BASE, // Full token supply required to create a gov, i.e. only realmAuth can do it
    STAKING_PROGRAM,
    undefined // new PublicKey(config.programs.localnet.staking) //TODO: Restore after max voter weight plugin implemented
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
