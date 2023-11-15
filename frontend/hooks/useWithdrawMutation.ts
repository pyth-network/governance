import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { useStakeConnection } from './useStakeConnection'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useMutation, useQueryClient } from 'react-query'
import { StakeAccountQueryPrefix } from './useStakeAccounts'

export function useWithdrawMutation() {
  const { data: stakeConnection } = useStakeConnection()
  const queryClient = useQueryClient()

  const depositMutation = useMutation(
    ['withdraw-callback'],
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
      const withdrawAmount = PythBalance.fromString(amount)
      if (withdrawAmount.gt(PythBalance.zero())) {
        if (mainStakeAccount) {
          try {
            await stakeConnection?.withdrawTokens(
              mainStakeAccount,
              withdrawAmount
            )
            toast.success('Withdraw successful!')
          } catch (e) {
            toast.error(capitalizeFirstLetter(e.message))
          }
        } else {
          toast.error('Stake account is undefined.')
        }
      } else {
        toast.error('Amount must be greater than 0.')
      }
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

  return depositMutation
}
