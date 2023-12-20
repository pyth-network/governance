import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { MainStakeAccount } from 'pages'

export const SplitRequestQueryPrefix = 'split-request'

export function useSplitRequest(mainStakeAccount: MainStakeAccount) {
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [SplitRequestQueryPrefix, mainStakeAccount],
    async () => {
      if (mainStakeAccount === 'NA') return undefined

      // only enabled when stakeConnection and mainStakeAccount is defined
      const splitRequest = await stakeConnection?.getSplitRequest(
        mainStakeAccount!
      )

      return splitRequest
    },
    {
      enabled: stakeConnection !== undefined && mainStakeAccount !== undefined,
    }
  )
}
