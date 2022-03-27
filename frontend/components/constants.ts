import { PublicKey } from '@solana/web3.js'

const LOCALNET_PROGRAM = new PublicKey(process.env.LOCALNET_PROGRAM!)
const DEVNET_PROGRAM = new PublicKey(process.env.DEVNET_PROGRAM!)

const LOCALNET_PYTH_MINT = new PublicKey(process.env.LOCALNET_PYTH_MINT!)
const DEVNET_PYTH_MINT = new PublicKey(process.env.DEVNET_PYTH_MINT!)

export const STAKING_PROGRAM =
  process.env.ENDPOINT === 'devnet' ? DEVNET_PROGRAM : LOCALNET_PROGRAM

export const PYTH_MINT_ACCOUNT_PUBKEY =
  process.env.ENDPOINT === 'devnet' ? DEVNET_PYTH_MINT : LOCALNET_PYTH_MINT

export const STAKE_ACCOUNT_METADATA_SEED = 'stake_metadata'
export const CUSTODY_SEED = 'custody'
export const AUTHORITY_SEED = 'authority'

export const DISCRIMINANT_SIZE = 8
export const POSITION_SIZE = 104
export const MAX_POSITIONS = 100
export const PUBKEY = 32

export const POSITIONS_ACCOUNT_SIZE =
  POSITION_SIZE * MAX_POSITIONS + DISCRIMINANT_SIZE + PUBKEY
