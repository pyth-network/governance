import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { useStakeConnection } from './useStakeConnection'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useMutation, useQueryClient } from 'react-query'
import { StakeAccountQueryPrefix } from './useStakeAccounts'

export function useUnlockMutation() {
  const { data: stakeConnection } = useStakeConnection()
  const queryClient = useQueryClient()

  const depositMutation = useMutation(
    ['unlock-callback'],
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
      const unlockAmount = PythBalance.fromString(amount)
      if (unlockAmount.gt(PythBalance.zero())) {
        if (mainStakeAccount) {
          try {
            await stakeConnection?.unlockTokens(mainStakeAccount, unlockAmount)
            toast.success('Unlock successful!')
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
