import { NextApiRequest, NextApiResponse } from 'next'
import { Provider } from '@project-serum/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet'
import { PythBalance } from '@pythnetwork/staking'

const connection = new Connection(process.env.ENDPOINT!)

export default async function handlerVestingAccounts(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { owner } = req.query

  if (owner == undefined || owner instanceof Array) {
    res.status(400).json({
      error: "Must provide the 'owner' query parameters",
    })
  } else {
    const balance = PythBalance.fromString('1')
    res.status(200).json({ balance: balance.toString() })
  }
}
