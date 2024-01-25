// This file contains utility functions for the API. We can't use StakeConnection directly because it has wasm imports that are not compatible with the Next API.

import { PublicKey } from "@solana/web3.js";
import { STAKING_ADDRESS } from "./constants";

export function getMetadataAccountAddress(positionAccountAddress: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake_metadata"), positionAccountAddress.toBuffer()],
    STAKING_ADDRESS
  )[0];
}

export function getCustodyAccountAddress(positionAccountAddress: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("custody"), positionAccountAddress.toBuffer()],
    STAKING_ADDRESS
  )[0];
}
