import { Token, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  SYSVAR_RENT_PUBKEY,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorError } from "@coral-xyz/anchor";
import assert from "assert";
import * as wasm from "@pythnetwork/staking-wasm";
import { Staking } from "../../target/types/staking";
import { GOVERNANCE_ADDRESS, REALM_ID, STAKING_ADDRESS } from "../../app";

type StakeTarget = anchor.IdlTypes<Staking>["Target"];

export function getConfigAccount(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [anchor.utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
    programId
  )[0];
}

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

export async function initAddressLookupTable(
  provider: anchor.AnchorProvider,
  mint: PublicKey
) {
  const configAccount = getConfigAccount(STAKING_ADDRESS);
  const targetAccount = await getTargetAccount({ voting: {} }, STAKING_ADDRESS);

  const [loookupTableInstruction, lookupTableAddress] =
    AddressLookupTableProgram.createLookupTable({
      authority: provider.publicKey,
      payer: provider.publicKey,
      recentSlot: await provider.connection.getSlot(),
    });
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    payer: provider.publicKey,
    authority: provider.publicKey,
    lookupTable: lookupTableAddress,
    addresses: [
      ComputeBudgetProgram.programId,
      SystemProgram.programId,
      STAKING_ADDRESS,
      REALM_ID,
      mint,
      configAccount,
      SYSVAR_RENT_PUBKEY,
      TOKEN_PROGRAM_ID,
      GOVERNANCE_ADDRESS(),
      targetAccount,
    ],
  });
  const createLookupTableTx = new VersionedTransaction(
    new TransactionMessage({
      instructions: [loookupTableInstruction, extendInstruction],
      payerKey: provider.publicKey,
      recentBlockhash: (await provider.connection.getLatestBlockhash())
        .blockhash,
    }).compileToV0Message()
  );
  await provider.sendAndConfirm(createLookupTableTx, [], {
    skipPreflight: true,
  });
  return lookupTableAddress;
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
