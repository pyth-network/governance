import { StakeAccount, PythBalance } from '@pythnetwork/staking'
import BN from 'bn.js'
import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'

export function useNextVestingEvent(
  mainStakeAccount: StakeAccount | undefined
) {
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(['next-vesting-event', mainStakeAccount], async () => {
    if (stakeConnection && mainStakeAccount) {
      const currentTime = await stakeConnection.getTime()
      const nextVestingEvent = mainStakeAccount.getNextVesting(currentTime)
      if (nextVestingEvent) {
        return {
          nextVestingAmount: new PythBalance(
            new BN(nextVestingEvent.amount.toString())
          ),
          nextVestingDate: new Date(Number(nextVestingEvent.time) * 1000),
        }
      }
    }

    return undefined
  })
}
