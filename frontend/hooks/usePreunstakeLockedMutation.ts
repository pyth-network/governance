import { StakeAccount, StakeConnection } from '@pythnetwork/staking'
import { useMutation, useQueryClient } from 'react-query'
import { StakeConnectionQueryKey } from './useStakeConnection'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export function usePreunstakeLockedMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['preunstake-locked-mutation'],
    async ({
      mainStakeAccount,
      stakeConnection,
    }: {
      mainStakeAccount: StakeAccount
      stakeConnection: StakeConnection
    }) => {
      await stakeConnection?.unlockBeforeVestingEvent(mainStakeAccount)
      toast.success('Tokens have started unstaking.')
      // TODO:
      //   toast.success(
      //     `${nextVestingAmount
      //       ?.add(lockedPythBalance ?? PythBalance.zero())
      //       .toString()} tokens have started unlocking. You will be able to withdraw them after ${nextVestingDate?.toLocaleString()}`
      //   )
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
