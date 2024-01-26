import { NextApiRequest, NextApiResponse } from 'next'
import { ZstdInit, ZstdStream } from '@oneidentity/zstd-js'
import { getAllStakeAccounts } from '../getAllStakingAccounts'
import { BorshCoder, Idl } from '@coral-xyz/anchor'
import IDL from '@pythnetwork/staking/target/idl/staking.json'
import { IdlCoder } from '@coral-xyz/anchor/dist/cjs/coder/borsh/idl'
import { IdlTypeDef } from '@coral-xyz/anchor/dist/cjs/idl'

const optionPositionType = {
  name: 'OptionPosition',
  type: {
    kind: 'struct',
    fields: [{ name: 'val', type: { option: { defined: 'Position' } } }],
  },
}
const optionPositionLayout = IdlCoder.typeDefLayout(
  optionPositionType as unknown as IdlTypeDef,
  (IDL as Idl).types
)

const RPC_URL = process.env.BACKEND_ENDPOINT!

const coder = new BorshCoder(IDL as Idl)
export default async function handlerSnapshot(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await ZstdInit()
  const stakeAccounts = await getAllStakeAccounts(RPC_URL)

  const owners: number[] = Object.keys(stakeAccounts).map((key, index) => {
    console.log(index, key.toString())
    return deserializePositionsAccount(stakeAccounts[key])
  })

  res.status(200).json(owners)
}

function deserializePositionsAccount(data: string): number {
  const buffer = Buffer.from(data, 'base64')
  const accountData = ZstdStream.decompress(new Uint8Array(buffer))
  const decoded = coder.accounts.decode(
    'PositionData',
    Buffer.from(accountData)
  )

  const decodedPositions = []
  for (let index = 0; index < 20; index++) {
    let decodedPosition = optionPositionLayout.decode(
      Buffer.from(decoded.positions[index])
    ).val
    decodedPositions.push(decodedPosition)
    if (!decodedPosition) {
      break
    }
  }

  return decodedPositions.length
}
