import { NextApiRequest, NextApiResponse } from 'next'
import { PythBalance } from '@pythnetwork/staking/app/pythBalance'
import BN from 'bn.js'

export default async function handlerVestingAccounts(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { owner } = req.query

  const balance = new PythBalance(new BN(1000))

  if (owner == undefined || owner instanceof Array) {
    res.status(400).json({
      error: "Must provide the 'owner' query parameters",
    })
  } else {
    res.status(200).json({ owner: balance.toString() })
  }
}
