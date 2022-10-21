import { PublicKey } from '@solana/web3.js'
import {
  DEVNET_PYTH_MINT,
  MAINNET_PYTH_MINT,
} from 'pyth-staking-api'

export const PYTH_MINT_ACCOUNT_PUBKEY =
  process.env.ENDPOINT === 'mainnet'
    ? MAINNET_PYTH_MINT : process.env.ENDPOINT === 'devnet' ? DEVNET_PYTH_MINT 
    : new PublicKey(process.env.LOCALNET_PYTH_MINT!)

