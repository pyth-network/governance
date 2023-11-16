import { StakeAccount, StakeConnection } from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { StakeConnectionQueryKey } from './useStakeConnection'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export function useUnvestedUnlockAllMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['unlock-all-unvested-mutation'],
    async ({
      mainStakeAccount,
      stakeConnection,
    }: {
      mainStakeAccount: StakeAccount
      stakeConnection: StakeConnection
    }) => {
      await stakeConnection.unlockAll(mainStakeAccount)
      toast.success(
        `All unvested tokens have been unlocked. Please relock them to participate in governance.`
      )
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
