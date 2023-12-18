import { NextApiRequest, NextApiResponse } from 'next'
import { PythBalance } from '@pythnetwork/staking/app/pythBalance'
import BN from 'bn.js'
import { STAKING_ADDRESS } from '@pythnetwork/staking/app/constants'
import { PYTH_TOKEN } from '@pythnetwork/staking/app/deploy/mainnet_beta'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider, IdlAccounts } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/lib/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getConfig,
  getCustodyAccountAddress,
  getMetadataAccountAddress,
} from './../locked_accounts'
import { getAllStakeAccounts } from '../all_locked_accounts'

const connection = new Connection(process.env.BACKEND_ENDPOINT!)
const provider = new AnchorProvider(
  connection,
  new NodeWallet(new Keypair()),
  {}
)
const stakingProgram = new Program<Staking>(
  idl as Staking,
  STAKING_ADDRESS,
  provider
)
const tokenProgram = splTokenProgram({
  programId: TOKEN_PROGRAM_ID,
  provider: provider as any,
})

export default async function handlerSupply(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { q } = req.query

  if (q === 'totalSupply') {
    res.setHeader('Cache-Control', 'max-age=0, s-maxage=3600')
    res.status(200).send((await getTotalSupply(tokenProgram)).toString(false))
  } else if (q === 'circulatingSupply') {
    const configAccountData = await getConfig(stakingProgram)
    const allStakeAccounts = await getAllStakeAccounts(connection)

    const allMetadataAccountAddresses = allStakeAccounts.map((account) =>
      getMetadataAccountAddress(account)
    )
    const allCustodyAccountAddresses = allStakeAccounts.map((account) =>
      getCustodyAccountAddress(account)
    )

    const allMetadataAccounts =
      await stakingProgram.account.stakeAccountMetadataV2.fetchMultiple(
        allMetadataAccountAddresses
      )
    const allCustodyAccounts = await tokenProgram.account.account.fetchMultiple(
      allCustodyAccountAddresses
    )

    const lockedCustodyAccounts = allCustodyAccounts.map((data, index) => {
      return { lock: allMetadataAccounts[index], amount: data?.amount }
    })

    const totalLockedAmount = lockedCustodyAccounts.reduce((total, account) => {
      return total.add(
        account.amount && account.lock
          ? new PythBalance(account.amount).min(
              getCurrentlyLockedAmount(account.lock, configAccountData)
            )
          : PythBalance.zero()
      )
    }, PythBalance.zero())

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

function getCurrentlyLockedAmount(
  metadataAccountData: IdlAccounts<Staking>['stakeAccountMetadataV2'],
  configAccountData: IdlAccounts<Staking>['globalConfig']
): PythBalance {
  const lock = metadataAccountData.lock
  const listTime = configAccountData.pythTokenListTime
  if (lock.fullyVested) {
    return PythBalance.zero()
  } else if (lock.periodicVestingAfterListing) {
    if (!listTime) {
      return new PythBalance(lock.periodicVestingAfterListing.initialBalance)
    } else {
      return getCurrentlyLockedAmountPeriodic(
        listTime,
        lock.periodicVestingAfterListing.periodDuration,
        lock.periodicVestingAfterListing.numPeriods,
        lock.periodicVestingAfterListing.initialBalance
      )
    }
  } else if (lock.periodicVesting) {
    return getCurrentlyLockedAmountPeriodic(
      lock.periodicVesting.startDate,
      lock.periodicVesting.periodDuration,
      lock.periodicVesting.numPeriods,
      lock.periodicVesting.initialBalance
    )
  } else {
    throw new Error('Should be unreachable')
  }
}

function getCurrentlyLockedAmountPeriodic(
  startDate: BN,
  periodDuration: BN,
  numPeriods: BN,
  initialBalance: BN
): PythBalance {
  const currentTimestamp = new BN(Math.floor(Date.now() / 1000))
  if (currentTimestamp.lte(startDate)) {
    return new PythBalance(initialBalance)
  } else {
    const periodsElapsed = startDate.sub(currentTimestamp).div(periodDuration)
    if (periodsElapsed.gte(numPeriods)) {
      return PythBalance.zero()
    } else {
      const remainingPeriods = numPeriods.sub(periodsElapsed)
      return new PythBalance(
        remainingPeriods.mul(initialBalance).div(numPeriods)
      )
    }
  }
}

async function getTotalSupply(tokenProgram: any): Promise<PythBalance> {
  const pythTokenMintData = await tokenProgram.account.mint.fetch(PYTH_TOKEN)
  return new PythBalance(pythTokenMintData.supply)
}
