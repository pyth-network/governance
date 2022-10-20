import { PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";
import { homedir } from "os";

export const AUTHORITY_PATH = "/.config/solana/deployer.json";
export const AUTHORITY_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(fs.readFileSync(homedir() + AUTHORITY_PATH).toString())
  )
);

export const PYTH_TOKEN = new PublicKey(
  "7Bd6bEH4wHTMmov8D2WTXgxzLJcxJYczqE5NaDtZdhF6"
);
export const STAKING_PROGRAM = new PublicKey(
  "sta99txADjRfwHQQMNckb8vUN4jcAAhN2HBMTR2Ah6d"
);
export const GOVERNANCE_PROGRAM = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);
export const REALM = new PublicKey(
  "44xGQELUXXD1TiLEMc73RBnCxeW8XKw27LyJNpt2G8bF"
);
export const RPC_NODE = "https://api.devnet.solana.com";
