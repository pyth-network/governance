import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { PROFILE_ADDRESS } from '@pythnetwork/staking/app/constants'
import { STAKING_ADDRESS } from '@pythnetwork/staking/app/constants'
import axios from 'axios'

// The JSON payload is too big when using the @solana/web3.js getProgramAccounts
// We get around this by using the base64+ztsd encoding instead of base64 that @solana/web3.js uses
export async function getAllStakeAccounts(
  url: string
): Promise<Record<string, any>> {
  const response = await axios({
    method: 'post',
    url: url,
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'getProgramAccounts',
      params: [
        STAKING_ADDRESS,
        {
          encoding: 'base64+zstd',
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from('55c3f14f7cc04f0b', 'hex')), // Positions account discriminator
              },
            },
          ],
        },
      ],
    },
  })

  const mapping = response.data.result.reduce(
    (obj: Record<string, any>, x: any) => {
      obj[x.pubkey] = x.account.data[0]
      return obj
    },
    {} as Record<string, any>
  )
  return mapping
}

export async function getAllProfileAccounts(
  url: string
): Promise<Record<string, any>> {
  const response = await axios({
    method: 'post',
    url: url,
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'getProgramAccounts',
      params: [
        PROFILE_ADDRESS,
        {
          encoding: 'base64+zstd',
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from('c25ab5a0b6ce749e', 'hex')), // Identity account discriminator
              },
            },
          ],
        },
      ],
    },
  })

  const mapping = response.data.result.reduce(
    (obj: Record<string, any>, x: any) => {
      obj[x.pubkey] = x.account.data[0]
      return obj
    },
    {} as Record<string, any>
  )

  return mapping
}
