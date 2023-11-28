import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { PythBalance } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { MainStakeAccount } from 'pages'

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

// It assumes that when mainStakeAccount is null the user has no previous
// stake account. It will return 0 balance in that scenario
export function useBalance(mainStakeAccount: MainStakeAccount) {
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [BalanceQueryKeyPrefix, mainStakeAccount],
    // see the enabled option: mainStakeAccount, stakeConnection will not be undefined
    async (): Promise<BalanceSummary> => {
      if (mainStakeAccount === 'NA')
        return {
          lockingPythBalance: PythBalance.zero(),
          lockedPythBalance: PythBalance.zero(),

          unlockingPythBalance: PythBalance.zero(),
          unlockedPythBalance: PythBalance.zero(),

          unvestedTotalPythBalance: PythBalance.zero(),
          unvestedLockingPythBalance: PythBalance.zero(),
          unvestedLockedPythBalance: PythBalance.zero(),
          unvestedPreUnlockingPythBalance: PythBalance.zero(),
          unvestedUnlockingPythBalance: PythBalance.zero(),
          unvestedUnlockedPythBalance: PythBalance.zero(),
        }

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
