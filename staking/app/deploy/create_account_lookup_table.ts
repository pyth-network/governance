import { Wallet, AnchorProvider } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, PYTH_TOKEN, RPC_NODE } from "./mainnet_beta";
import { initAddressLookupTable } from "../../tests/utils/before";

async function main() {
  const client = new Connection(RPC_NODE);
  const provider = new AnchorProvider(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    {}
  );
  await initAddressLookupTable(provider, PYTH_TOKEN);
}

main();
