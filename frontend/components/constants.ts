import { PublicKey } from '@solana/web3.js'
import {
  DEVNET_STAKING_ADDRESS,
  LOCALNET_STAKING_ADDRESS,
  DEVNET_PYTH_MINT,
} from 'pyth-staking-api'

const LOCALNET_PYTH_MINT = new PublicKey(process.env.LOCALNET_PYTH_MINT!)

export const STAKING_PROGRAM =
  process.env.ENDPOINT === 'devnet'
    ? DEVNET_STAKING_ADDRESS
    : LOCALNET_STAKING_ADDRESS

export const PYTH_MINT_ACCOUNT_PUBKEY =
  process.env.ENDPOINT === 'devnet'
    ? DEVNET_PYTH_MINT
    : LOCALNET_PYTH_MINT
