import { Token, MintLayout } from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { AnchorError, ProgramError } from "@project-serum/anchor";
import assert from "assert";
import * as wasm from "pyth-staking-wasm";
import { Staking } from "../../target/types/staking";

type StakeTarget = anchor.IdlTypes<Staking>["Target"];

export async function getTargetAccount(
  stakeTarget: StakeTarget,
  programId: PublicKey
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(wasm.Constants.TARGET_SEED()),
        stakeTarget.hasOwnProperty("voting")
          ? anchor.utils.bytes.utf8.encode(wasm.Constants.VOTING_TARGET_SEED())
          : anchor.utils.bytes.utf8.encode(wasm.Constants.DATA_TARGET_SEED()),

        stakeTarget.hasOwnProperty("voting")
          ? Buffer.from("")
          : (stakeTarget as any).staking.product.toBuffer(),
      ],
      programId
    )
  )[0];
}
/**
 * Creates new spl-token at a random keypair
 */
export async function createMint(
  provider: anchor.AnchorProvider,
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
  const tx = await provider.sendAndConfirm(transaction, [mintAccount], {
    skipPreflight: true,
  });
}

/**
 * Sends the rpc call and check whether the error message matches the provided string
 * @param rpcCall : anchor rpc call
 * @param error : expected string
 * @param idlErrors : mapping from error code to error message
 */
export async function expectFail(
  rpcCall,
  error: string,
  idlErrors: Map<number, string>
) {
  try {
    const tx = await rpcCall.rpc();
    assert(false, "Transaction should fail");
  } catch (err) {
    if (err instanceof AnchorError) {
      assert.equal(err.error.errorMessage, error);
    } else {
      throw err;
    }
  }
}

/**
 * Awaits the api request and checks whether the error message matches the provided string
 * @param promise : api promise
 * @param error : expected string
 */
export async function expectFailApi(promise: Promise<any>, error: string) {
  try {
    await promise;
    assert(false, "Operation should fail");
  } catch (err) {
    assert.equal(err.message, error);
  }
}

/**
 * Awaits the api request and checks whether the error message matches the provided string
 * @param promise : api promise
 * @param errorCode : expected string
 */
export async function expectFailWithCode(
  promise: Promise<any>,
  errorCode: string
) {
  let actualErrorCode: string | undefined = undefined;
  try {
    await promise;
    assert(false, "Operation should fail");
  } catch (err) {
    if (err instanceof AnchorError) {
      actualErrorCode = err.error.errorCode.code;
    }
  }
  assert.equal(
    actualErrorCode,
    errorCode,
    `Call did not fail with the expected error code.`
  );
}
