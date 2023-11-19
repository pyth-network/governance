import { PythBalance } from '@pythnetwork/staking'
import BN from 'bn.js'
import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { MainStakeAccount } from 'pages/staking'

export function useNextVestingEvent(mainStakeAccount: MainStakeAccount) {
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    ['next-vesting-event', mainStakeAccount],
    // enabled only when stakeConnection and mainStakeAccount is defined
    async () => {
      if (mainStakeAccount === 'NA') return undefined

      const currentTime = await stakeConnection!.getTime()
      const nextVestingEvent = mainStakeAccount!.getNextVesting(currentTime)
      if (nextVestingEvent) {
        return {
          nextVestingAmount: new PythBalance(
            new BN(nextVestingEvent.amount.toString())
          ),
          nextVestingDate: new Date(Number(nextVestingEvent.time) * 1000),
        }
      }

      return undefined
    },
    {
      enabled: stakeConnection !== undefined && mainStakeAccount !== undefined,
    }
  )
}
