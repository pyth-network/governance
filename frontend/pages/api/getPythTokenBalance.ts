import { PYTH_MINT_ACCOUNT_PUBKEY } from '@components/constants'
import { Connection, PublicKey } from '@solana/web3.js'
import { PythBalance } from 'pyth-staking-api'
import { BN } from 'bn.js'

export const getPythTokenBalance = async (
  connection: Connection,
  publicKey: PublicKey,
  pythTokenMint: PublicKey
) => {
  let balance = new BN(0);
    try {
    const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
      mint: pythTokenMint,
    })
    for (const account of tokenAccounts.value) {
      const test = await connection.getTokenAccountBalance(account.pubkey)
      balance.iadd(new BN(test.value.amount) ? new BN(test.value.amount) : new BN(0))
    }
  } catch (e) {
    console.error(e)
  }
  return new PythBalance(balance)
}
