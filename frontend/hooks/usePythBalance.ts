import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import { getPythTokenBalance } from 'pages/api/getPythTokenBalance'
import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { PythBalance } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const PythBalanceQueryKeyPrefix = 'pyth-balance'

export function usePythBalance() {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [PythBalanceQueryKeyPrefix, anchorWallet?.publicKey.toString()],
    async (): Promise<PythBalance | undefined> => {
      if (anchorWallet === undefined || stakeConnection === undefined)
        return undefined
      return await getPythTokenBalance(
        connection,
        anchorWallet.publicKey,
        stakeConnection.config.pythTokenMint
      )
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },
      enabled: anchorWallet !== undefined && stakeConnection !== undefined,
    }
  )
}
