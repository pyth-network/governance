import { PublicKey } from "@solana/web3.js";
import { homedir } from "os";
import { loadKeypair } from "../../tests/utils/keys";
export const AUTHORITY_PATH = "/.config/solana/deployer.json";
export const AUTHORITY_KEYPAIR = loadKeypair(homedir() + AUTHORITY_PATH);

export const MULTISIG_AUTHORITY = new PublicKey(
  "7g4Los4WMQnpxYiBJpU1HejBiM6xCk5RDFGCABhWE9M6"
);

export const PYTH_TOKEN = new PublicKey(
  "7Bd6bEH4wHTMmov8D2WTXgxzLJcxJYczqE5NaDtZdhF6"
);

export const RPC_NODE = "https://api.devnet.solana.com";

