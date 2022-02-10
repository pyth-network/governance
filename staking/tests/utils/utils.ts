import { Token, MintLayout } from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  Signer,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";

export async function createMint(
  provider: anchor.Provider,
  payer: Signer,
  mintAccount: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number,
  programId: PublicKey
): Promise<Token> {
  const token = new Token(
    provider.connection,
    mintAccount.publicKey,
    programId,
    payer
  );

  // Allocate memory for the account
  const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
    provider.connection
  );

  const transaction = new Transaction();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
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
  const tx = await sendAndConfirmTransaction(provider.connection, transaction, [
    payer, mintAccount
  ], {skipPreflight : true});

  console.log(tx);

  return token;
}
