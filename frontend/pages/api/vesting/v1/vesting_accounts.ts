import { NextApiRequest, NextApiResponse } from 'next'
import { Provider } from '@project-serum/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet'
import {
  PythBalance,
  STAKING_ADDRESS,
  StakeConnection,
} from '@pythnetwork/staking'

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
    const stakeConnection = await StakeConnection.createStakeConnection(
      connection,
      new NodeWallet(new Keypair()),
      STAKING_ADDRESS
    )
    const stakeAccounts = await stakeConnection.getStakeAccounts(
      new PublicKey(owner)
    )
    const currentTime = await stakeConnection.getTime()

    res.status(200).json(
      stakeAccounts.map((stakeAccount) => {
        const lock = stakeAccount.stakeAccountMetadata.lock as any
        if (lock.periodicVestingAfterListing) {
          return {
            custodyAddress: stakeAccount.custodyAddress,
            amount: new PythBalance(stakeAccount.tokenBalance).toString(),
            lockingSchedule: 'periodicVestingAfterListing',
            nextVestingEvent: stakeAccount.getNextVesting(currentTime),
          }
        }
        return {
          custodyAddress: stakeAccount.custodyAddress,
          amount: new PythBalance(stakeAccount.tokenBalance).toString(),
          lockingSchedule: stakeAccount.stakeAccountMetadata.lock,
        }
      })
    )
  }
}
