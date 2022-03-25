import { PublicKey } from '@solana/web3.js'

const LOCALNET_PROGRAM = new PublicKey(
  'Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS')
const DEVNET_PROGRAM = new PublicKey('CXJkmPRdCCsqdbqT5t8pw94VhrhiSnHuXLPR2dYjsFg')

const LOCALNET_PYTH_MINT = new PublicKey('GiLLpVm6gWwM6kLbEFgQkwapg1j34YPs3dG6vjqG38Ag') // replace this whenever running locally
const DEVNET_PYTH_MINT = new PublicKey('EceXQPnPa9kozZjDVW2LgNjew4aWNJpGCGCFuwJ8J4KB')

export const STAKING_PROGRAM = process.env.ENDPOINT === 'localnet' ? LOCALNET_PROGRAM : DEVNET_PROGRAM

export const PYTH_MINT_ACCOUNT_PUBKEY = process.env.ENDPOINT === 'localnet' ? LOCALNET_PYTH_MINT : DEVNET_PYTH_MINT


export const STAKE_ACCOUNT_METADATA_SEED = 'stake_metadata'
export const CUSTODY_SEED = 'custody'
export const AUTHORITY_SEED = 'authority'

export const DISCRIMINANT_SIZE = 8
export const POSITION_SIZE = 104
export const MAX_POSITIONS = 100
export const PUBKEY = 32

export const POSITIONS_ACCOUNT_SIZE =
  POSITION_SIZE * MAX_POSITIONS + DISCRIMINANT_SIZE + PUBKEY
