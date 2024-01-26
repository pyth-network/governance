import { NextApiRequest, NextApiResponse } from 'next'
import { ZstdInit, ZstdStream } from '@oneidentity/zstd-js'
import {
  getAllProfileAccounts,
  getAllStakeAccounts,
} from '../getAllStakingAccounts'
import { BN, BorshCoder, Idl } from '@coral-xyz/anchor'
import IDL from '@pythnetwork/staking/target/idl/staking.json'
import { IdlCoder } from '@coral-xyz/anchor/dist/cjs/coder/borsh/idl'
import { IdlTypeDef } from '@coral-xyz/anchor/dist/cjs/idl'
import { PublicKey } from '@solana/web3.js'
import * as ProfileIDL from '@pythnetwork/staking/target/idl/profile.json'
import { getIdentityAccountAddress } from '@pythnetwork/staking/app/ProfileConnection'
import { ethers } from 'ethers'

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
const profileCoder = new BorshCoder(ProfileIDL as Idl)

const epoch = new BN(Date.now() / 1000).div(new BN(3600 * 24 * 7))

export default async function handlerSnapshot(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await ZstdInit()
  const stakeAccounts = await getAllStakeAccounts(RPC_URL)
  const profileAccounts = await getAllProfileAccounts(RPC_URL)

  const stakers: { solana: PublicKey; stakedAmount: string }[] = Object.keys(
    stakeAccounts
  ).map((key, index) => {
    return getStakerAndAmount(stakeAccounts[key], epoch)
  })

  const stakersWithProfile = stakers.map(({ solana, stakedAmount }) => {
    return { solana, stakedAmount, evm: getEvmProfile(solana, profileAccounts) }
  })

  res.status(200).json(stakersWithProfile)
}

function getStakerAndAmount(
  data: string,
  epoch: BN
): { solana: PublicKey; stakedAmount: string } {
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
    if (!decodedPosition) {
      break
    }
    decodedPositions.push(decodedPosition)
  }

  const stakedAmount = decodedPositions.reduce(
    (acc, position) => getStakedBalance(position, epoch).add(acc),
    new BN(0)
  )

  return { solana: decoded.owner, stakedAmount: stakedAmount.toString() }
}

function getStakedBalance(position: any, epoch: BN): BN {
  if (
    position.activationEpoch.lte(epoch) &&
    (!position.unlockingStart || epoch.lt(position.unlockingStart))
  ) {
    return position.amount
  } else {
    return new BN(0)
  }
}

function getEvmProfile(solana: PublicKey, profileAccounts: any): string {
  const profileAddress = getIdentityAccountAddress(solana, 'evm')
  if (profileAccounts[profileAddress.toString()]) {
    const accountData = ZstdStream.decompress(
      new Uint8Array(
        Buffer.from(profileAccounts[profileAddress.toString()], 'base64')
      )
    )
    const decoded = profileCoder.accounts.decode(
      'IdentityAccount',
      Buffer.from(accountData)
    )
    if (decoded.identity.evm.pubkey) {
      return ethers.getAddress(
        '0x' + Buffer.from(decoded.identity.evm.pubkey).toString('hex')
      )
    }
  }
  return ''
}
