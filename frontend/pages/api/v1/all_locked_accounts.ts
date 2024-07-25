import { NextApiRequest, NextApiResponse } from 'next'
import { PythBalance } from '@pythnetwork/staking/app/pythBalance'
import { getAllLockedCustodyAccounts } from '@pythnetwork/staking/app/api_utils'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

const RPC_URL = process.env.BACKEND_ENDPOINT!
const connection = new Connection(RPC_URL)
const provider = new AnchorProvider(
  connection,
  new NodeWallet(new Keypair()),
  {}
)
const stakingProgram = new Program<Staking>(idl as Staking, provider)
const tokenProgram = splTokenProgram({
  programId: TOKEN_PROGRAM_ID,
  provider: provider as any,
})

export default async function handlerAllLockedAccounts(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const allLockedCustodyAccounts = await getAllLockedCustodyAccounts(
    stakingProgram,
    tokenProgram
  )

  const totalLockedAmount = allLockedCustodyAccounts.reduce(
    (
      total: PythBalance,
      account: { pubkey: PublicKey; amount: PythBalance }
    ) => {
      return total.add(account.amount)
    },
    PythBalance.zero()
  )

  const data = {
    totalLockedAmount: totalLockedAmount.toString(),
    accounts: allLockedCustodyAccounts.map((account) => {
      return {
        custodyAccount: account.pubkey.toBase58(),
        actualAmount: account.amount.toString(),
      }
    }),
  }

  res.setHeader('Cache-Control', 'max-age=0, s-maxage=3600')
  res.status(200).json(data)
}
