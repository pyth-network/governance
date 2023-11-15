import { StakeAccount } from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import toast from 'react-hot-toast'
import { StakeAccountQueryPrefix } from './useStakeAccounts'

export function useUnvestedUnlockAllMutation() {
  const { data: stakeConnection } = useStakeConnection()
  const queryClient = useQueryClient()

  return useMutation(
    ['unlock-all-unvested', stakeConnection],
    async (mainStakeAccount?: StakeAccount) => {
      if (mainStakeAccount === undefined || stakeConnection === undefined)
        return
      await stakeConnection?.unlockAll(mainStakeAccount)
      toast.success(
        `All unvested tokens have been unlocked. Please relock them to participate in governance.`
      )
    },
    {
      onSuccess() {
        queryClient.invalidateQueries(StakeAccountQueryPrefix)
      },
      onError(error: Error) {
        toast.error(error.message)
      },
    }
  )
}
