import { PublicKey } from '@solana/web3.js'

export const STAKING_PROGRAM = new PublicKey(
  'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS'
)

export const PYTH_MINT_ACCOUNT_PUBKEY = new PublicKey(
  '2qF1zgC38b6LRa51G2NndLn8dxtE9AUassGyUJuw5nWh'
)

export const STAKE_ACCOUNT_METADATA_SEED = 'stake_metadata'
export const CUSTODY_SEED = 'custody'
export const AUTHORITY_SEED = 'authority'

export const DISCRIMINANT_SIZE = 8
export const POSITION_SIZE = 104
export const MAX_POSITIONS = 100
export const PUBKEY = 32

export const POSITIONS_ACCOUNT_SIZE =
  POSITION_SIZE * MAX_POSITIONS + DISCRIMINANT_SIZE + PUBKEY
