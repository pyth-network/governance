import {
  PythBalance,
  StakeAccount,
  StakeConnection,
} from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { StakeConnectionQueryKey } from './useStakeConnection'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export function useStakeLockedMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['stake-locked-mutation'],
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
      const stakedAmount = PythBalance.fromString(amount)
      if (stakedAmount.gt(PythBalance.zero())) {
        await stakeConnection.lockTokens(mainStakeAccount, stakedAmount)
        toast.success('Successfully staked!')
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
