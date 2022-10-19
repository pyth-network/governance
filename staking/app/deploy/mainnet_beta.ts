import { PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";
import { homedir } from "os";

export const AUTHORITY_PATH = "/.config/solana/deployer.json";
export const AUTHORITY_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(fs.readFileSync(homedir() + AUTHORITY_PATH).toString())
  )
);

export const PYTH_TOKEN = new PublicKey(
  "3ho8ZM4JVqJzD56FADKdW7NTG5Tv6GiBPFUvyRXMy35Q"
);
export const STAKING_PROGRAM = new PublicKey(
  "sta99txADjRfwHQQMNckb8vUN4jcAAhN2HBMTR2Ah6d"
);
export const GOVERNANCE_PROGRAM = new PublicKey(
  "GovFUVGZWWwyoLq8rhnoVWknRFkhDSbQiSoREJ5LiZCV"
);
export const REALM = new PublicKey(
  "A1f6LNEymJSSJsEVCL1FSgtS1jA9dNTC4ni8SkmbwQjG"
);
export const RPC_NODE = "https://api.mainnet-beta.solana.com";

export const EPOCH_DURATION = 3600 * 24 * 7;
