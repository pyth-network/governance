import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { PublicKey } from '@solana/web3.js'
import axios from 'axios'

// The JSON payload is too big when using the @solana/web3.js getProgramAccounts
// We get around this by using the base64+ztsd encoding instead of base64 that @solana/web3.js uses
export async function getAllStakeAccounts(url: string): Promise<PublicKey[]> {
  console.log('LOG')
  const response = await axios({
    method: 'post',
    url: url,
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'getProgramAccounts',
      params: [
        'pytS9TjG1qyAZypk7n8rw8gfW9sUaqqYyMhJQ4E7JCQ',
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
  console.log('LOG2')
  return response.data.result.map((x: any) => new PublicKey(x.pubkey))
}
