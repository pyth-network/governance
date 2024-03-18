import { Wallet, AnchorProvider } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, PYTH_TOKEN, RPC_NODE } from "./devnet";
import { initAddressLookupTable } from "../../tests/utils/utils";
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

main();
