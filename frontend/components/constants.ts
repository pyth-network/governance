import { PublicKey } from '@solana/web3.js'
import {
  DEVNET_STAKING_ADDRESS,
  LOCALNET_STAKING_ADDRESS,
} from 'pyth-staking-api'

export const STAKING_PROGRAM =
  process.env.ENDPOINT === 'devnet'
    ? DEVNET_STAKING_ADDRESS
    : LOCALNET_STAKING_ADDRESS

export const PYTH_MINT_ACCOUNT_PUBKEY =
  process.env.ENDPOINT === 'devnet'
    ? new PublicKey(process.env.DEVNET_PYTH_MINT!)
    : new PublicKey(process.env.LOCALNET_PYTH_MINT!)
