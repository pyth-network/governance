import { NextApiRequest, NextApiResponse } from 'next'
import { PythBalance } from '@pythnetwork/staking/app/pythBalance'
import BN from 'bn.js'
import { STAKING_ADDRESS } from '@pythnetwork/staking/app/constants'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { Program, AnchorProvider, IdlAccounts } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/lib/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getCustodyAccountAddress,
  getMetadataAccountAddress,
} from './locked_accounts'

const ONE_YEAR = new BN(3600 * 24 * 365)

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

export default async function handlerAllLockedAccounts(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const allStakeAccounts = await getAllStakeAccounts(connection)

  const allMetadataAccounts = await getAllMetadataAccounts(
    stakingProgram,
    allStakeAccounts
  )

  const allCustodyAccountAddresses = allStakeAccounts.map((account) =>
    getCustodyAccountAddress(account)
  )
  const allCustodyAccounts = await tokenProgram.account.account.fetchMultiple(
    allCustodyAccountAddresses
  )

  const lockedCustodyAccounts = allCustodyAccounts
    .map((data, index) => {
      return { pubkey: allCustodyAccountAddresses[index], data }
    })
    .filter((account, index) => {
      const metadataAccountData = allMetadataAccounts[index]
      return (
        metadataAccountData &&
        account.data &&
        hasStandardLockup(metadataAccountData)
      )
    })
    .sort((a, b) => {
      return a.data!.amount.lte(b.data!.amount) ? 1 : -1
    }) // ! is safe because of the filter above

  const totalLockedAmount = new PythBalance(
    lockedCustodyAccounts.reduce((total, account) => {
      return total.add(account.data ? new BN(account.data.amount) : new BN(0))
    }, new BN(0))
  )

  const data = {
    totalLockedAmount: totalLockedAmount.toString(),
    accounts: lockedCustodyAccounts.map((account) => {
      return {
        custodyAccount: account.pubkey.toBase58(),
        actualAmount: new PythBalance(account.data!.amount).toString(), // ! is safe because of the filter above
      }
    }),
  }

  res.setHeader('Cache-Control', 'max-age=0, s-maxage=3600')
  res.status(200).json(data)
}

function hasStandardLockup(
  metadataAccountData: IdlAccounts<Staking>['stakeAccountMetadataV2']
) {
  return (
    metadataAccountData.lock.periodicVestingAfterListing &&
    metadataAccountData.lock.periodicVestingAfterListing.numPeriods.eq(
      new BN(4)
    ) &&
    metadataAccountData.lock.periodicVestingAfterListing.periodDuration.eq(
      ONE_YEAR
    )
  )
}
export async function getAllStakeAccounts(connection: Connection) {
  const response = await connection.getProgramAccounts(STAKING_ADDRESS, {
    encoding: 'base64',
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from('55c3f14f7cc04f0b', 'hex')), // Positions account discriminator
        },
      },
    ],
  })
  return response.map((account) => {
    return account.pubkey
  })
}

export async function getAllMetadataAccounts(
  stakingProgram: Program<Staking>,
  stakeAccounts: PublicKey[]
): Promise<(IdlAccounts<Staking>['stakeAccountMetadataV2'] | null)[]> {
  const metadataAccountAddresses = stakeAccounts.map((account) =>
    getMetadataAccountAddress(account)
  )
  return stakingProgram.account.stakeAccountMetadataV2.fetchMultiple(
    metadataAccountAddresses
  )
}

export async function getAllCustodyAccounts(
  tokenProgram: any,
  stakeAccounts: PublicKey[]
) {
  const allCustodyAccountAddresses = stakeAccounts.map((account) =>
    getCustodyAccountAddress(account)
  )
  return tokenProgram.account.account.fetchMultiple(allCustodyAccountAddresses)
}
