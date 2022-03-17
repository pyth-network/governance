import { Program } from "@project-serum/anchor";
import { Staking } from "../../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import {ProgramError } from "@project-serum/anchor";
import assert from "assert";
import { positions_account_size } from "./constant";
import { utils } from "@project-serum/anchor";

/**
 * Sends the rpc call and check whether the error message matches the provided string
 * @param rpc_call : anchor rpc call
 * @param error : expected string
 * @param idlErrors : mapping from error code to error message
 */
export async function expect_fail(rpc_call , error : string, idlErrors : Map<number,string>){
  try {
    const tx = await rpc_call.rpc();
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

export async function createStakeAccount(
  program: Program<Staking>,
  stakeAccountPositionsSecret: Keypair,
  pyth_mint_account: PublicKey
) {
  const tx = await program.methods
    .createStakeAccount(program.provider.wallet.publicKey, { fullyVested: {} })
    .preInstructions([
      SystemProgram.createAccount({
        fromPubkey: program.provider.wallet.publicKey,
        newAccountPubkey: stakeAccountPositionsSecret.publicKey,
        lamports:
          await program.provider.connection.getMinimumBalanceForRentExemption(
            positions_account_size
          ),
        space: positions_account_size,
        programId: program.programId,
      }),
    ])
    .accounts({
      stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      mint: pyth_mint_account,
    })
    .signers([stakeAccountPositionsSecret])
    .rpc({
      skipPreflight: false,
    });
  return tx;
}

export async function depositTokensInstruction(
  program: Program<Staking>,
  stakeAccountPositionsAddress: PublicKey,
  pyth_mint_account: PublicKey,
  amount: number
) {
  const from_account = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pyth_mint_account,
    program.provider.wallet.publicKey
  );

  const to_account = (
    await PublicKey.findProgramAddress(
      [
        utils.bytes.utf8.encode("custody"),
        stakeAccountPositionsAddress.toBuffer(),
      ],
      program.programId
    )
  )[0];

  const ix = Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    from_account,
    to_account,
    program.provider.wallet.publicKey,
    [],
    amount
  );

  return ix;
}
