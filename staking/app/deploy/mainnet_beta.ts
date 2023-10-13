import { PublicKey } from "@solana/web3.js";
import { homedir } from "os";
import { loadKeypair } from "../../tests/utils/keys";
export const AUTHORITY_PATH = "/.config/solana/deployer.json";
export const AUTHORITY_KEYPAIR = loadKeypair(homedir() + AUTHORITY_PATH);

export const MULTISIG_AUTHORITY = new PublicKey(
  "6oXTdojyfDS8m5VtTaYB9xRCxpKGSvKJFndLUPV3V3wT"
);

export const PYTH_TOKEN = new PublicKey(
  "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3"
);

export const RPC_NODE = "https://api.mainnet-beta.solana.com";
