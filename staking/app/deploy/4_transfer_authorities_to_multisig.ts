import {
  PROGRAM_VERSION_V2,
  withSetRealmAuthority,
  SetRealmAuthorityAction,
} from "@solana/spl-governance";
import { Transaction, Connection } from "@solana/web3.js";

import {
  AUTHORITY_KEYPAIR,
  RPC_NODE,
  MULTISIG_AUTHORITY,
} from "./mainnet_beta";

import { GOVERNANCE_ADDRESS, REALM_ID, STAKING_ADDRESS } from "../constants";
import { AnchorProvider, Program, Wallet } from "@project-serum/anchor";
// Actual transaction hash :
// mainnet-beta : 3FDjeBC946SZ6ZgSiDiNzFHKS5hs9bAXYrJKGZrGw1tuVcwi4BxXB1qvqsVmvtcnG5mzYvLM4hmPLjUTiCiY6Tfe
// devnet : 54WrJp6FDXvJCVzaGojUtWz4brm8wJHx3ZTYCpSTF2EwmeswySYsQY335XhJ1A7KL2N4mhYW7NtAGJpMA2fM9M6W

async function main() {
  const client = new Connection(RPC_NODE);
  const provider = new AnchorProvider(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    {}
  );
  const idl = (await Program.fetchIdl(STAKING_ADDRESS, provider))!;
  const program = new Program(idl, STAKING_ADDRESS, provider);

  const tx = new Transaction();
  withSetRealmAuthority(
    tx.instructions,
    GOVERNANCE_ADDRESS(),
    PROGRAM_VERSION_V2,
    REALM_ID,
    AUTHORITY_KEYPAIR.publicKey,
    MULTISIG_AUTHORITY,
    SetRealmAuthorityAction.SetUnchecked
  );
  tx.instructions.push(
    await program.methods
      .updateGovernanceAuthority(MULTISIG_AUTHORITY)
      .instruction()
  );

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
