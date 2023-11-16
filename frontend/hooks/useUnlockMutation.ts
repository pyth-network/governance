import {
  PythBalance,
  StakeAccount,
  StakeConnection,
} from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { StakeConnectionQueryKey } from './useStakeConnection'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useMutation, useQueryClient } from 'react-query'

export function useUnlockMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['unlock-mutation'],
    async ({
      amount,
      stakeConnection,
      mainStakeAccount,
    }: {
      amount: string
      stakeConnection: StakeConnection
      mainStakeAccount: StakeAccount
    }) => {
      if (!amount) {
        throw new Error('Please enter a valid amount!')
      }
      const unlockAmount = PythBalance.fromString(amount)
      if (unlockAmount.gt(PythBalance.zero())) {
        await stakeConnection.unlockTokens(mainStakeAccount, unlockAmount)
        toast.success('Unlock successful!')
      } else {
        throw new Error('Amount must be greater than 0.')
      }
    },
    {
      onSuccess() {
        // invalidate all except stake connection
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== StakeConnectionQueryKey,
        })
      },
      onError(error: Error) {
        toast.error(capitalizeFirstLetter(error.message))
      },
    }
  )
}
