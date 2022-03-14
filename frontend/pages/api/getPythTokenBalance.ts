import { PYTH_MINT_ACCOUNT, STAKING_PROGRAM } from '@components/constants'
import { Provider, Program, Idl, Wallet } from '@project-serum/anchor'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { AnchorWallet } from '@solana/wallet-adapter-react'
import { Connection, PublicKey } from '@solana/web3.js'

export const getPythTokenBalance = async (
  connection: Connection,
  publicKey: PublicKey
) => {
  const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
    mint: PYTH_MINT_ACCOUNT,
  })
  let balance = 0
  for (const account of tokenAccounts.value) {
    const test = await connection.getTokenAccountBalance(account.pubkey)
    balance += test.value.uiAmount ? test.value.uiAmount : 0
  }
  return balance
}
