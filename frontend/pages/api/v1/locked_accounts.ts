import { AnchorProvider, Program } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { STAKING_ADDRESS } from '@pythnetwork/staking/app/constants'
import { PythBalance } from '@pythnetwork/staking/app/pythBalance'
import { Staking } from '@pythnetwork/staking/lib/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { NextApiRequest, NextApiResponse } from 'next'

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

export default async function handlerLockedAccounts(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { owner } = req.query

  if (owner == undefined || owner instanceof Array) {
    res.status(400).json({
      error: "Must provide the 'owner' query parameters",
    })
  } else {
    const stakeAccounts = await getStakeAccounts(
      connection,
      new PublicKey(owner)
    )
    const stakeAccountDetails = await Promise.all(
      stakeAccounts.map((account) => {
        return getStakeAccountDetails(account)
      })
    )
    res.setHeader('Cache-Control', 'max-age=0, s-maxage=3600')
    res.status(200).json(stakeAccountDetails)
  }
}

async function getStakeAccountDetails(positionAccountAddress: PublicKey) {
  const configAccountAddress = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    STAKING_ADDRESS
  )[0]
  const configAccountData = await stakingProgram.account.globalConfig.fetch(
    configAccountAddress
  )

  const metadataAccountAddress = getMetadataAccountAddress(
    positionAccountAddress
  )
  const metadataAccountData =
    await stakingProgram.account.stakeAccountMetadataV2.fetch(
      metadataAccountAddress
    )

  const lock = metadataAccountData.lock

  const custodyAccountAddress = getCustodyAccountAddress(positionAccountAddress)
  const custodyAccountData = await tokenProgram.account.account.fetch(
    custodyAccountAddress
  )

  return {
    custodyAccount: custodyAccountAddress.toBase58(),
    actualAmount: new PythBalance(custodyAccountData.amount).toString(),
    lock: getLockSummary(lock, configAccountData.pythTokenListTime),
  }
}

export function getMetadataAccountAddress(positionAccountAddress: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stake_metadata'), positionAccountAddress.toBuffer()],
    STAKING_ADDRESS
  )[0]
}

export function getCustodyAccountAddress(positionAccountAddress: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('custody'), positionAccountAddress.toBuffer()],
    STAKING_ADDRESS
  )[0]
}

async function getStakeAccounts(connection: Connection, owner: PublicKey) {
  const response = await connection.getProgramAccounts(STAKING_ADDRESS, {
    encoding: 'base64',
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from('55c3f14f7cc04f0b', 'hex')), // Positions account discriminator
        },
      },
      {
        memcmp: {
          offset: 8,
          bytes: owner.toBase58(),
        },
      },
    ],
  })
  return response.map((account) => {
    return account.pubkey
  })
}

export function getLockSummary(lock: any, listTime: BN | null) {
  if (lock.fullyVested) {
    return { type: 'fullyUnlocked' }
  } else if (lock.periodicVestingAfterListing) {
    return {
      type: 'periodicUnlockingAfterListing',
      schedule: getUnlockEvents(
        listTime,
        lock.periodicVestingAfterListing.periodDuration,
        lock.periodicVestingAfterListing.numPeriods,
        lock.periodicVestingAfterListing.initialBalance
      ),
    }
  } else if (lock.periodicVesting) {
    return {
      type: 'periodicUnlocking',
      schedule: getUnlockEvents(
        lock.periodicVesting.startDate,
        lock.periodicVesting.periodDuration,
        lock.periodicVesting.numPeriods,
        lock.periodicVesting.initialBalance
      ),
    }
  }
}

export function getUnlockEvents(
  startData: BN | null,
  periodDuration: BN,
  numberOfPeriods: BN,
  initialBalance: BN
) {
  if (startData) {
    return Array(numberOfPeriods.toNumber())
      .fill(0)
      .map((_, i) => {
        return {
          date: startData.add(periodDuration.muln(i + 1)).toString(),
          amount: new PythBalance(
            initialBalance.divn(numberOfPeriods.toNumber())
          ).toString(),
        }
      })
  }
  return []
}

export const config = {
  runtime: 'experimental-edge',
}
