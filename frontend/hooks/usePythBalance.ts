import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { getPythTokenBalance } from 'pages/api/getPythTokenBalance'
import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { PythBalance } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const PythBalanceQueryKeyPrefix = 'pyth-balance'

export function usePythBalance() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [PythBalanceQueryKeyPrefix, publicKey],
    async (): Promise<PythBalance | undefined> => {
      if (publicKey === null || stakeConnection === undefined) return undefined
      return await getPythTokenBalance(
        connection,
        publicKey,
        stakeConnection.config.pythTokenMint
      )
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },
      enabled: publicKey !== null && stakeConnection !== undefined,
    }
  )
}
