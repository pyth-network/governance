import { PublicKey } from "@solana/web3.js";

export function GOVERNANCE_ADDRESS(): PublicKey {
  return new PublicKey("pytGY6tWRgGinSCvRLnSv4fHfBTMoiDGiCsesmHWM6U");
}

export const STAKING_ADDRESS = new PublicKey(
  "pytS9TjG1qyAZypk7n8rw8gfW9sUaqqYyMhJQ4E7JCQ"
);

export const WALLET_TESTER_ADDRESS = new PublicKey(
  "tstPARXbQ5yxVkRU2UcZRbYphzbUEW6t5ihzpLaafgz"
);

export const REALM_ID = new PublicKey(
  "4ct8XU5tKbMNRphWy4rePsS9kBqPhDdvZoGpmprPaug4"
);

export const EPOCH_DURATION = 3600 * 24 * 7;
