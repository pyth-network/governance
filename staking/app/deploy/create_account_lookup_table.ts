import { Wallet, AnchorProvider } from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, PYTH_TOKEN, RPC_NODE } from "./devnet";
import { getConfigAccount, getTargetAccount } from "../../tests/utils/utils";
import { GOVERNANCE_ADDRESS, REALM_ID, STAKING_ADDRESS } from "../constants";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function main() {
  const client = new Connection(RPC_NODE);
  const provider = new AnchorProvider(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    {}
  );
  const lookupTableAddress = await initAddressLookupTable(provider, PYTH_TOKEN);
  console.log("Lookup table address: ", lookupTableAddress.toBase58());
}

async function initAddressLookupTable(
  provider: AnchorProvider,
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
  await provider.sendAndConfirm(createLookupTableTx, []);
  return lookupTableAddress;
}

main();
