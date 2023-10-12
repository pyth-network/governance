import { PublicKey } from "@solana/web3.js";
import { wasm } from "./StakeConnection";

export function GOVERNANCE_ADDRESS() {
  return new PublicKey(wasm.Constants.GOVERNANCE_PROGRAM());
}

export const STAKING_ADDRESS = new PublicKey(
  "pytS9TjG1qyAZypk7n8rw8gfW9sUaqqYyMhJQ4E7JCQ"
);

export const REALM_ID = new PublicKey(
  "A1f6LNEymJSSJsEVCL1FSgtS1jA9dNTC4ni8SkmbwQjG"
);

export const EPOCH_DURATION = 3600 * 24 * 7;
