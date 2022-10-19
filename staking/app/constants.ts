import { PublicKey } from "@solana/web3.js";

export const MAINNET_ENDPOINT = "https://api.mainnet-beta.solana.com";
export const DEVNET_ENDPOINT = "https://api.devnet.solana.com";

export const MAINNET_GOVERNANCE_ADDRESS = new PublicKey(
  "GovFUVGZWWwyoLq8rhnoVWknRFkhDSbQiSoREJ5LiZCV"
);
export const DEVNET_GOVERNANCE_ADDRESS = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);
export const LOCALNET_GOVERNANCE_ADDRESS = new PublicKey(
  "GovFUVGZWWwyoLq8rhnoVWknRFkhDSbQiSoREJ5LiZCV"
);

export const MAINNET_STAKING_ADDRESS = new PublicKey(
  "sta99txADjRfwHQQMNckb8vUN4jcAAhN2HBMTR2Ah6d"
);
export const LOCALNET_STAKING_ADDRESS = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export const DEVNET_STAKING_ADDRESS = new PublicKey(
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
