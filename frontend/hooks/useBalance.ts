import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const BalanceQueryKeyPrefix = 'balance'

type BalanceSummary = {
  lockingPythBalance: PythBalance
  lockedPythBalance: PythBalance

  unlockingPythBalance: PythBalance
  unlockedPythBalance: PythBalance

  unvestedTotalPythBalance: PythBalance
  unvestedLockingPythBalance: PythBalance
  unvestedLockedPythBalance: PythBalance
  unvestedPreUnlockingPythBalance: PythBalance
  unvestedUnlockingPythBalance: PythBalance
  unvestedUnlockedPythBalance: PythBalance
}
export function useBalance(mainStakeAccount?: StakeAccount) {
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [BalanceQueryKeyPrefix, mainStakeAccount?.address.toString()],
    // see the enabled option: mainStakeAccount, stakeConnection will not be undefined
    async (): Promise<BalanceSummary | undefined> => {
      const { withdrawable, locked, unvested } =
        mainStakeAccount!.getBalanceSummary(await stakeConnection!.getTime())

      return {
        lockingPythBalance: locked.locking,
        lockedPythBalance: locked.locked,

        unlockingPythBalance: locked.unlocking.add(locked.preunlocking),
        unlockedPythBalance: withdrawable,

        unvestedTotalPythBalance: unvested.total,
        unvestedLockingPythBalance: unvested.locking,
        unvestedLockedPythBalance: unvested.locked,
        unvestedPreUnlockingPythBalance: unvested.preunlocking,
        unvestedUnlockingPythBalance: unvested.unlocking,
        unvestedUnlockedPythBalance: unvested.unlocking,
      }
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },

      enabled: stakeConnection !== undefined && mainStakeAccount !== undefined,
    }
  )
}
