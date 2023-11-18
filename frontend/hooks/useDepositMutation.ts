import {
  PythBalance,
  StakeAccount,
  StakeConnection,
} from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { StakeConnectionQueryKey } from './useStakeConnection'
import { useMutation, useQueryClient } from 'react-query'

export function useDepositMutation() {
  const queryClient = useQueryClient()

  return useMutation(
    ['deposit-mutation'],
    async ({
      amount,
      stakeConnection,
      mainStakeAccount,
    }: {
      amount: string
      stakeConnection: StakeConnection
      mainStakeAccount: StakeAccount | undefined | null
    }) => {
      if (!amount) {
        throw new Error('Please enter a valid amount!')
      }
      const depositAmount = PythBalance.fromString(amount)
      if (depositAmount.gt(PythBalance.zero())) {
        await stakeConnection?.depositAndLockTokens(
          // Throughout the website we have used mainStakeAccount is null if there is no
          // prev mainStakeAccount. It is undefined if things are loading.
          // It is defined if there is one
          // But this library method doesn't make that distinction.
          // We are handling this disparity here only where the two codebase meet.
          mainStakeAccount === null ? undefined : mainStakeAccount,
          depositAmount
        )
        toast.success(`Deposit and locked ${amount} PYTH tokens!`)
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
        toast.error(error.message)
      },
    }
  )
}
