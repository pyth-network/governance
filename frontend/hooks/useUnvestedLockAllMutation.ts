import { StakeAccount } from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import toast from 'react-hot-toast'
import { StakeAccountQueryPrefix } from './useStakeAccounts'
import { VestingAccountStateQueryPrefix } from './useVestingAccountState'

export function useUnvestedLockAllMutation() {
  const { data: stakeConnection } = useStakeConnection()
  const queryClient = useQueryClient()

  return useMutation(
    ['lock-all-unvested', stakeConnection],
    async (mainStakeAccount?: StakeAccount) => {
      if (mainStakeAccount === undefined || stakeConnection === undefined)
        return
      await stakeConnection?.lockAllUnvested(mainStakeAccount)
      toast.success('Successfully opted into governance!')
    },
    {
      onSuccess() {
        queryClient.invalidateQueries(StakeAccountQueryPrefix)
        queryClient.invalidateQueries(VestingAccountStateQueryPrefix)
      },
      onError(error: Error) {
        toast.error(error.message)
      },
    }
  )
}
