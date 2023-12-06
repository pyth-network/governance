import { StakeAccount, StakeConnection } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { useMutation } from 'react-query'

export function useJoinDaoLlcMutation() {
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
      toast.success(`Successfully signed LLC!`)
    },
    {
      onError(error: Error) {
        toast.error(error.message)
      },
    }
  )
}
