import { StakeAccount, StakeConnection } from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { StakeConnectionQueryKey } from './useStakeConnection'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export function useUnvestedLockAllMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['lock-all-unvested-mutation'],
    async ({
      stakeConnection,
      mainStakeAccount,
    }: {
      stakeConnection: StakeConnection
      mainStakeAccount: StakeAccount
    }) => {
      await stakeConnection.lockAllUnvested(mainStakeAccount)
      toast.success('Successfully opted into governance!')
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
