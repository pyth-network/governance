import { PublicKey } from '@solana/web3.js'

const LOCALNET_PROGRAM = new PublicKey(process.env.LOCALNET_PROGRAM!)
const DEVNET_PROGRAM = new PublicKey(process.env.DEVNET_PROGRAM!)

const LOCALNET_PYTH_MINT = new PublicKey(process.env.LOCALNET_PYTH_MINT!)
const DEVNET_PYTH_MINT = new PublicKey(process.env.DEVNET_PYTH_MINT!)

export const STAKING_PROGRAM =
  process.env.ENDPOINT === 'devnet' ? DEVNET_PROGRAM : LOCALNET_PROGRAM

export const PYTH_MINT_ACCOUNT_PUBKEY =
  process.env.ENDPOINT === 'devnet' ? DEVNET_PYTH_MINT : LOCALNET_PYTH_MINT

export const GOVERNANCE_PROGRAM = new PublicKey("pythGovernance11111111111111111111111111111");