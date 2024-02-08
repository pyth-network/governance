import { NextApiRequest, NextApiResponse } from 'next'
import { PythBalance } from '@pythnetwork/staking/app/pythBalance'
import { STAKING_ADDRESS } from '@pythnetwork/staking/app/constants'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/lib/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { splTokenProgram } from '@coral-xyz/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  getTotalSupply,
  getAllLockedCustodyAccounts,
} from '@pythnetwork/staking/app/api_utils'

const RPC_URL = process.env.BACKEND_ENDPOINT!
const connection = new Connection(RPC_URL)
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
