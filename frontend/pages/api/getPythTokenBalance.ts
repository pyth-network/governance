import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { PythBalance } from '@pythnetwork/staking'
import { BN } from 'bn.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  Token,
} from '@solana/spl-token'

export const getPythTokenBalance = async (
  connection: Connection,
  publicKey: PublicKey,
  pythTokenMint: PublicKey
) => {
  const mint = new Token(
    connection,
    pythTokenMint,
    TOKEN_PROGRAM_ID,
    new Keypair()
  )

  const pythAtaAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pythTokenMint,
    publicKey,
    true
  )

  try {
    const pythAtaAccountInfo = await mint.getAccountInfo(pythAtaAddress)
    return new PythBalance(pythAtaAccountInfo.amount)
  } catch (e) {
    console.error(e)
  }

  return new PythBalance(new BN(0))
}
