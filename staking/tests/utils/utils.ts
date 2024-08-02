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
import { AnchorError, ProgramError, Provider, utils } from "@coral-xyz/anchor";
import assert from "assert";
import * as wasm from "@pythnetwork/staking-wasm";
import { GOVERNANCE_ADDRESS, REALM_ID, STAKING_ADDRESS } from "../../app";
import { Target } from "../../app/StakeConnection";
import { AllInstructions } from "@coral-xyz/anchor/dist/cjs/program/namespace/types";
import { Staking } from "../../target/types/staking";
import { MethodsBuilder } from "@coral-xyz/anchor/dist/cjs/program/namespace/methods";

export function getConfigAccount(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
    programId
  )[0];
}

export async function getTargetAccount(
  programId: PublicKey
): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddressSync(
      [
        utils.bytes.utf8.encode(wasm.Constants.TARGET_SEED()),
        utils.bytes.utf8.encode(wasm.Constants.VOTING_TARGET_SEED()),
      ],
      programId
    )
  )[0];
}
/**
 * Creates new spl-token at a random keypair
 */
export async function createMint(
  provider: Provider,
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
      fromPubkey: provider.publicKey,
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
  const tx = await provider.sendAndConfirm(transaction, [mintAccount]);
}

export async function initAddressLookupTable(
  provider: Provider,
  mint: PublicKey
) {
  const configAccount = getConfigAccount(STAKING_ADDRESS);
  const targetAccount = await getTargetAccount(STAKING_ADDRESS);

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
  await provider.sendAndConfirm(createLookupTableTx, []);
  return lookupTableAddress;
}

/**
 * Sends the rpc call and check whether the error message matches the provided string
 * @param rpcCall : anchor rpc call
 * @param error : expected string
 * @param idlErrors : mapping from error code to error message
 */
export async function expectFail<
  I extends AllInstructions<Staking>,
  A extends I["accounts"][number] = I["accounts"][number]
>(rpcCall: MethodsBuilder<Staking, I, A>, expectedMessage: string) {
  try {
    await rpcCall.rpc();
    assert(false, "Transaction should fail");
  } catch (err) {
    if (err instanceof AnchorError) {
      assert.equal(err.error.errorMessage, expectedMessage);
    } else if (err instanceof ProgramError) {
      // Sometimes it becomes ProgramError, I don't know why
      assert.equal(err.msg, expectedMessage);
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
