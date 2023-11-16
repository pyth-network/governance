import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { StakeAccount } from '@pythnetwork/staking'

export const VestingAccountStateQueryPrefix = 'vesting-account-state'

export function useVestingAccountState(
  mainStakeAccount: StakeAccount | undefined
) {
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [VestingAccountStateQueryPrefix, mainStakeAccount],
    async () => {
      // only enabled when stakeConnection and mainStakeAccount is defined
      const currentTime = await stakeConnection!.getTime()
      const vestingAccountState =
        mainStakeAccount!.getVestingAccountState(currentTime)

      return vestingAccountState
    },
    {
      enabled: stakeConnection !== undefined && mainStakeAccount !== undefined,
    }
  )
}
