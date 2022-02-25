import { Token, MintLayout } from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";

/**
 * Creates new spl-token at a random keypair
 */
export async function createMint(
  provider: anchor.Provider,
  mintAccount: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  programId: PublicKey
): Promise<void> {
  // Allocate memory for the account
  const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
    provider.connection
  );

  const transaction = new Transaction();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: balanceNeeded,
      space: MintLayout.span,
      programId,
    })
  );

  transaction.add(
    Token.createInitMintInstruction(
      programId,
      mintAccount.publicKey,
      decimals,
      mintAuthority,
      freezeAuthority
    )
  );

  // Send the two instructions
  const tx = await provider.send(transaction, [mintAccount], {
    skipPreflight: true,
  });
}

/**
 * Parses an error message from solana into a human-readable message
 */
export function parseErrorMessage(err: any, idlErrors: Map<number, string>) {
  if (err.msg)
    return err.msg;
  if (err.code)
    return idlErrors[err.code];
  // E.g. Raw transaction 4c5uRCyQMVfqEuyBceA6wQknB4NpJh9A5sggU7wufHaZD9UztHMvaBwz4oBXYxCBT98cXmGeuoPitjr6nYm3opFk failed ({"err":{"InstructionError":[0,{"Custom":6002}]}})
  return idlErrors.get(parseInt(err.toString().split("{")[3].split("}")[0].split(":")[1]));
}
