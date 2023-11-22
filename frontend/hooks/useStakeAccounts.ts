import { Wallet } from '@coral-xyz/anchor'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from './useStakeConnection'
import { useQuery } from 'react-query'

export const StakeAccountQueryPrefix = 'get-stake-accounts'

// if stake connection is undefined, it will return an empty array
// else it will return the fetched accounts
export function useStakeAccounts() {
  const { data: stakeConnection } = useStakeConnection()
  const anchorWallet = useAnchorWallet()

  return useQuery(
    [StakeAccountQueryPrefix, anchorWallet?.publicKey.toString()],
    () => {
      // stakeConnection and anchorWallet are defined, as we have used enabled below
      return stakeConnection!.getStakeAccounts(
        (anchorWallet as Wallet).publicKey
      )
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },

      enabled: stakeConnection !== undefined && anchorWallet !== undefined,
    }
  )
}
