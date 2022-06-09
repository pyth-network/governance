import {
  MintMaxVoteWeightSource,
  PROGRAM_VERSION_V2,
  withSetRealmConfig,
} from "@solana/spl-governance";
import { Transaction, Connection } from "@solana/web3.js";

import {
  AUTHORITY_KEYPAIR,
  STAKING_PROGRAM,
  GOVERNANCE_PROGRAM,
  RPC_NODE,
  REALM,
} from "./devnet";

async function main() {
  const tx = new Transaction();
  await withSetRealmConfig(
    tx.instructions,
    GOVERNANCE_PROGRAM,
    PROGRAM_VERSION_V2,
    REALM,
    AUTHORITY_KEYPAIR.publicKey,
    undefined, // no council mint
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    MintMaxVoteWeightSource.SUPPLY_FRACTION_BASE, // Full token supply required to create a gov, i.e. only realmAuth can do it
    STAKING_PROGRAM,
    STAKING_PROGRAM, // new PublicKey(config.programs.localnet.staking) //TODO: Restore after max voter weight plugin implemented
    AUTHORITY_KEYPAIR.publicKey
  );

  const client = new Connection(RPC_NODE);

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
