import { StakeAccount } from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import toast from 'react-hot-toast'
import { StakeAccountQueryPrefix } from './useStakeAccounts'

export function useUnvestedPreUnlockAllMutation() {
  const { data: stakeConnection } = useStakeConnection()
  const queryClient = useQueryClient()

  return useMutation(
    ['unlock-pre-all-unvested', stakeConnection],
    async (mainStakeAccount?: StakeAccount) => {
      if (mainStakeAccount === undefined || stakeConnection === undefined)
        return
      await stakeConnection?.unlockBeforeVestingEvent(mainStakeAccount)
      //   toast.success(
      //     `${nextVestingAmount
      //       ?.add(lockedPythBalance ?? PythBalance.zero())
      //       .toString()} tokens have started unlocking. You will be able to withdraw them after ${nextVestingDate?.toLocaleString()}`
      //   )
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
