import { NextApiRequest, NextApiResponse } from 'next'
import { ZstdInit, ZstdStream } from '@oneidentity/zstd-js'
import { getAllStakeAccounts } from '../getAllStakingAccounts'
import { BorshCoder, Idl } from '@coral-xyz/anchor'
import IDL from '@pythnetwork/staking/target/idl/staking.json'
import { PublicKey } from '@solana/web3.js'

const RPC_URL = process.env.BACKEND_ENDPOINT!

const coder = new BorshCoder(IDL as Idl)
export default async function handlerSnapshot(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await ZstdInit()
  const stakeAccounts = await getAllStakeAccounts(RPC_URL)

  const owners: PublicKey[] = Object.keys(stakeAccounts).map((key) => {
    return deserializePositionsAccount(stakeAccounts[key])
  })

  res.status(200).json(owners)
}

function deserializePositionsAccount(data: string): PublicKey {
  const buffer = Buffer.from(data, 'base64')
  const accountData = ZstdStream.decompress(new Uint8Array(buffer))
  const decoded = coder.accounts.decode(
    'PositionData',
    Buffer.from(accountData)
  )
  return decoded.owner
}
