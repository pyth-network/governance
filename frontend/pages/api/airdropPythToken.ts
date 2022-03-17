import {
  PYTH_MINT_ACCOUNT_PUBKEY,
  PYTH_MINT_AUTHORITY_KEYPAIR,
} from '@components/constants'
import { Provider } from '@project-serum/anchor'
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
} from '@solana/spl-token'

import { PublicKey, Transaction } from '@solana/web3.js'

export const airdropPythToken = async (provider: Provider, user: PublicKey) => {
  const transaction = new Transaction()
  const ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    PYTH_MINT_ACCOUNT_PUBKEY,
    user
  )
  const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    PYTH_MINT_ACCOUNT_PUBKEY,
    ata,
    user,
    user
  )
  transaction.add(create_ata_ix)

  // Mint 1000 tokens.
  const mint_ix = Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    PYTH_MINT_ACCOUNT_PUBKEY,
    ata,
    PYTH_MINT_AUTHORITY_KEYPAIR.publicKey,
    [],
    500
  )
  transaction.add(mint_ix)
  await provider.send(transaction, [PYTH_MINT_AUTHORITY_KEYPAIR])
}
