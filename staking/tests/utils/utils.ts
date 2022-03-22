import { Token, MintLayout } from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import {ProgramError } from "@project-serum/anchor";
import assert from "assert";

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
 * Sends the rpc call and check whether the error message matches the provided string
 * @param rpcCall : anchor rpc call
 * @param error : expected string
 * @param idlErrors : mapping from error code to error message
 */
export async function expectFail(rpcCall , error : string, idlErrors : Map<number,string>){
  try {
    const tx = await rpcCall.rpc();
    assert(false, "Transaction should fail");
  } catch (err) {
    if (err instanceof ProgramError) {
      assert.equal(
        parseErrorMessage(err, idlErrors),
        error
      );
    } else {
      throw err;
    }
  }
}


/**
 * Parses an error message from solana into a human-readable message
 */
export function parseErrorMessage(err: any, idlErrors: Map<number, string>) {
  if (err.msg)
    return err.msg;
  if (err.code)
    return idlErrors[err.code];
}
