import { NextApiRequest, NextApiResponse } from 'next'
import { PythBalance } from '@pythnetwork/staking'
import { STAKING_ADDRESS } from '@pythnetwork/staking'
import { Connection, Keypair } from '@solana/web3.js'
import { Program, AnchorProvider, IdlTypes, BN } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/lib/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getTotalSupply,
  ONE_YEAR,
  getConfig,
  getCurrentlyLockedAmount,
} from '@pythnetwork/staking'

const RPC_URL = process.env.BACKEND_ENDPOINT!
const connection = new Connection(RPC_URL)
const provider = new AnchorProvider(
  connection,
  new NodeWallet(new Keypair()),
  {}
)

const GLOBAL_VESTING_SCHEDULE: IdlTypes<Staking>['vestingSchedule'] = {
  periodicVestingAfterListing: {
    initialBalance: PythBalance.fromString('8,500,000,000').toBN(),
    periodDuration: ONE_YEAR,
    numPeriods: new BN(4),
  },
}

const stakingProgram = new Program<Staking>(idl as Staking, provider)
const tokenProgram = splTokenProgram({
  programId: TOKEN_PROGRAM_ID,
  provider: provider as any,
})

/**
 * This API imitates the one implemented by https://avascan.info/api/v1/supply
 * It is used by Coinmarketcap to display the right circulating and total supply of PYTH
 */
export default async function handlerSupply(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { q } = req.query

  if (q === 'totalSupply') {
    res.setHeader('Cache-Control', 'max-age=0, s-maxage=3600')
    res.status(200).send((await getTotalSupply(tokenProgram)).toString(false))
  } else if (q === 'circulatingSupply') {
    const config = await getConfig(stakingProgram)
    const totalLockedAmount = getCurrentlyLockedAmount(
      GLOBAL_VESTING_SCHEDULE,
      config
    )
    res.setHeader('Cache-Control', 'max-age=0, s-maxage=3600')
    res
      .status(200)
      .send(
        (await getTotalSupply(tokenProgram))
          .sub(totalLockedAmount)
          .toString(false)
      )
  } else {
    res.status(400).send({
      error:
        "The 'q' query parameter must be one of 'totalSupply' or 'circulatingSupply'.",
    })
  }
}
