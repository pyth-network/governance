import { PublicKey } from "@solana/web3.js";
import { homedir } from "os";
import { loadKeypair } from "../../tests/utils/keys";
export const AUTHORITY_PATH = "/.config/solana/deployer.json";
export const AUTHORITY_KEYPAIR = loadKeypair(homedir() + AUTHORITY_PATH);

export const MULTISIG_AUTHORITY = new PublicKey(
  "6oXTdojyfDS8m5VtTaYB9xRCxpKGSvKJFndLUPV3V3wT"
);

export const PYTH_TOKEN = new PublicKey(
  "3ho8ZM4JVqJzD56FADKdW7NTG5Tv6GiBPFUvyRXMy35Q"
);

export const RPC_NODE = "https://api.mainnet-beta.solana.com";

export const EPOCH_DURATION = 3600 * 24 * 7;
