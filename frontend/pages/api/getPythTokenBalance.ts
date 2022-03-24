import { PYTH_MINT_ACCOUNT_PUBKEY } from '@components/constants'
import { Connection, PublicKey } from '@solana/web3.js'

export const getPythTokenBalance = async (
  connection: Connection,
  publicKey: PublicKey
) => {
  let balance = 0
  try {
    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: PYTH_MINT_ACCOUNT_PUBKEY,
    })
    for (const account of tokenAccounts.value) {
      const test = await connection.getTokenAccountBalance(account.pubkey)
      balance += test.value.uiAmount ? test.value.uiAmount : 0
    }
  } catch (e) {
    console.error(e)
  }
  return balance
}
