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
  const tx = await provider.send(
    transaction,
    [mintAccount],
    { skipPreflight: true }
  );

  console.log("Mint transaction signature", tx);
}
