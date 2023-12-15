import { StakeAccount, StakeConnection } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { useMutation, useQueryClient } from 'react-query'
import { StakeConnectionQueryKey } from './useStakeConnection'

export function useJoinDaoLlcMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['sign-llc-mutation'],
    async ({
      stakeConnection,
      mainStakeAccount,
    }: {
      stakeConnection: StakeConnection
      mainStakeAccount: StakeAccount
    }) => {
      await stakeConnection.joinDaoLlc(mainStakeAccount)
      toast.success(`Successfully signed LLC agreement!`)
    },
    {
      onSuccess() {
        // invalidate all except stake connection
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== StakeConnectionQueryKey,
        })
      },

      onError(error: Error) {
        toast.error(error.message)
      },
    }
  )
}
