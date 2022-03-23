import { PYTH_MINT_ACCOUNT_PUBKEY } from '@components/constants'
import { PublicKey } from '@solana/web3.js'

export type SplTokenInformation = {
  name: string
  mint: PublicKey
  decimals: number
}

export type SupportedSplTokenNames = 'USDC' | 'WSOL' | 'PYTH'

export const SPL_TOKENS: {
  [key in SupportedSplTokenNames]: SplTokenInformation
} = {
  USDC: {
    name: 'USD Coin',
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    decimals: 6,
  },
  WSOL: {
    name: 'Wrapped SOL',
    mint: new PublicKey('So11111111111111111111111111111111111111112'),
    decimals: 9,
  },
  PYTH: {
    name: 'Pyth',
    mint: PYTH_MINT_ACCOUNT_PUBKEY,
    decimals: 6,
  },
} as const

export type SplTokenUIName = typeof SPL_TOKENS[keyof typeof SPL_TOKENS]['name']

export function getSplTokenMintAddressByUIName(
  nameToMatch: SplTokenUIName
): PublicKey {
  const item = Object.entries(SPL_TOKENS).find(
    ([_, { name }]) => name === nameToMatch
  )

  // theoretically impossible case
  if (!item) {
    throw new Error('Unable to find SPL token mint address by UI name')
  }

  const [, { mint }] = item

  return mint
}
