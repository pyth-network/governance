import { PublicKey } from "@solana/web3.js";
import { wasm } from "./StakeConnection";

export const MAINNET_ENDPOINT = "https://api.mainnet-beta.solana.com";
export const DEVNET_ENDPOINT = "https://api.devnet.solana.com";

export function GOVERNANCE_ADDRESS() {
  return new PublicKey(wasm.Constants.GOVERNANCE_PROGRAM());
}

export const STAKING_ADDRESS = new PublicKey(
  "sta99txADjRfwHQQMNckb8vUN4jcAAhN2HBMTR2Ah6d"
);

export const MAINNET_REALM_ID = new PublicKey(
  "A1f6LNEymJSSJsEVCL1FSgtS1jA9dNTC4ni8SkmbwQjG"
);
export const LOCALNET_REALM_ID = new PublicKey(
  "44xGQELUXXD1TiLEMc73RBnCxeW8XKw27LyJNpt2G8bF"
);
export const DEVNET_REALM_ID = LOCALNET_REALM_ID;

export const MAINNET_PYTH_MINT = new PublicKey(
  "3ho8ZM4JVqJzD56FADKdW7NTG5Tv6GiBPFUvyRXMy35Q"
);
export const DEVNET_PYTH_MINT = new PublicKey(
  "7Bd6bEH4wHTMmov8D2WTXgxzLJcxJYczqE5NaDtZdhF6"
);
