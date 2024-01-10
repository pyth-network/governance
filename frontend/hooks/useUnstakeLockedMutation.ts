import {
  PythBalance,
  StakeAccount,
  StakeConnection,
} from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { StakeConnectionQueryKey } from './useStakeConnection'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export function useUnstakeLockedMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['unstake-locked-mutation'],
    async ({
      amount,
      mainStakeAccount,
      stakeConnection,
    }: {
      amount: string
      mainStakeAccount: StakeAccount
      stakeConnection: StakeConnection
    }) => {
      if (!amount) {
        throw new Error('Please enter a valid amount!')
      }
      const stakedAmount = PythBalance.fromString(amount)
      if (stakedAmount.gt(PythBalance.zero())) {
        await stakeConnection.unlockTokensUnchecked(
          mainStakeAccount,
          stakedAmount
        )
        toast.success('Tokens have started unstaking!')
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
