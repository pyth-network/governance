import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { StakeAccount } from '@pythnetwork/staking'

export function useVestingAccountState(
  mainStakeAccount: StakeAccount | undefined
) {
  const { data: stakeConnection } = useStakeConnection()
  return useQuery(['vesting-account-state', mainStakeAccount], async () => {
    if (stakeConnection && mainStakeAccount) {
      const currentTime = await stakeConnection.getTime()
      const vestingAccountState =
        mainStakeAccount.getVestingAccountState(currentTime)

      return vestingAccountState
    }

    return undefined
  })
}
