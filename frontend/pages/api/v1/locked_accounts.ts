import { NextApiRequest, NextApiResponse } from 'next'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getStakeAccountDetails,
  getStakeAccountsByOwner,
} from '@pythnetwork/staking'

const connection = new Connection(process.env.BACKEND_ENDPOINT!)
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
    const stakeAccounts = await getStakeAccountsByOwner(
      connection,
      new PublicKey(owner)
    )

    const stakeAccountDetails = await Promise.all(
      stakeAccounts.map((account) => {
        return getStakeAccountDetails(stakingProgram, tokenProgram, account)
      })
    )
    res.status(200).json(stakeAccountDetails)
  }
}
