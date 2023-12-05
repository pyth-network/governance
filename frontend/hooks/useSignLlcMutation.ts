import {
  PythBalance,
  StakeAccount,
  StakeConnection,
} from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { useMutation } from 'react-query'

export function useSignLlcMutation() {
  return useMutation(
    ['sign-llc-mutation'],
    async ({
      stakeConnection,
      mainStakeAccount,
    }: {
      stakeConnection: StakeConnection
      mainStakeAccount: StakeAccount
    }) => {
      await stakeConnection.signLlc(mainStakeAccount)
      toast.success(`Successfully signed LLC!`)
    },
    {
      onError(error: Error) {
        toast.error(error.message)
      },
    }
  )
}
