import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import {
  StakeConnectionQueryKey,
  useStakeConnection,
} from './useStakeConnection'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useMutation, useQueryClient } from 'react-query'
import { StakeAccountQueryPrefix } from './useStakeAccounts'

export function useDepositMutation() {
  const { data: stakeConnection } = useStakeConnection()
  const queryClient = useQueryClient()

  const depositMutation = useMutation(
    ['deposit-callback'],
    async ({
      amount,
      mainStakeAccount,
    }: {
      amount: string
      mainStakeAccount?: StakeAccount
    }) => {
      if (!amount) {
        throw new Error('Please enter a valid amount!')
      }
      const depositAmount = PythBalance.fromString(amount)
      if (depositAmount.gt(PythBalance.zero())) {
        try {
          if (stakeConnection) {
            await stakeConnection?.depositAndLockTokens(
              mainStakeAccount,
              depositAmount
            )
            toast.success(`Deposit and locked ${amount} PYTH tokens!`)
          }
        } catch (e) {
          throw new Error(capitalizeFirstLetter(e.message))
        }
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

  return depositMutation
}
