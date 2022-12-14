import { PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";
import { homedir } from "os";
export const AUTHORITY_PATH = "/.config/solana/deployer.json";
export const AUTHORITY_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(fs.readFileSync(homedir() + AUTHORITY_PATH).toString())
  )
);

export const MULTISIG_AUTHORITY = new PublicKey(
  "7g4Los4WMQnpxYiBJpU1HejBiM6xCk5RDFGCABhWE9M6"
);

export const PYTH_TOKEN = new PublicKey(
  "7Bd6bEH4wHTMmov8D2WTXgxzLJcxJYczqE5NaDtZdhF6"
);

export const RPC_NODE = "https://api.devnet.solana.com";

export const EPOCH_DURATION = 3600;
