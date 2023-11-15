import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { getPythTokenBalance } from 'pages/api/getPythTokenBalance'
import { useQuery } from 'react-query'
import { useStakeConnection } from './useStakeConnection'
import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const BalanceQueryKeyPrefix = 'balance'

type BalanceSummary = {
  pythBalance: PythBalance

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
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const { data: stakeConnection } = useStakeConnection()

  return useQuery(
    [BalanceQueryKeyPrefix, publicKey, mainStakeAccount],
    async (): Promise<BalanceSummary | undefined> => {
      if (publicKey === null || stakeConnection === undefined) return undefined
      const pythBalance = await getPythTokenBalance(
        connection,
        publicKey,
        stakeConnection.config.pythTokenMint
      )

      if (mainStakeAccount !== undefined) {
        const { withdrawable, locked, unvested } =
          mainStakeAccount.getBalanceSummary(await stakeConnection.getTime())

        return {
          pythBalance,

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
      }

      return {
        pythBalance,

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
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },
    }
  )
}
