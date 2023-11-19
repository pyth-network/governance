import { BasePanel } from './BasePanel'
import { StakeAccount, VestingAccountState } from '@pythnetwork/staking'
import { useUnlockMutation } from 'hooks/useUnlockMutation'
import { useBalance } from 'hooks/useBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'
import { useVestingAccountState } from 'hooks/useVestingAccountState'

type UnstakePanelProps = {
  mainStakeAccount: StakeAccount | undefined | null
}
const Description =
  'Unstake PYTH. Unstaking tokens enables you to withdraw them from the program after a cooldown period of two epochs. Unstaked tokens cannot participate in governance.'

export function UnstakePanel({ mainStakeAccount }: UnstakePanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const unlockMutation = useUnlockMutation()
  const { data: stakeConnection, isLoading: isStakeConnectionLoading } =
    useStakeConnection()
  const { isLoading: isAccountsLoading } = useStakeAccounts()
  const { data: balanceData, isLoading: isBalanceLoading } =
    useBalance(mainStakeAccount)
  const { lockedPythBalance } = balanceData ?? {}

  const { data: vestingAccountState } = useVestingAccountState(mainStakeAccount)

  const accountWithLockedTokens =
    vestingAccountState === undefined
      ? false
      : vestingAccountState != VestingAccountState.FullyVested &&
        vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked

  return (
    <BasePanel
      description={Description}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        unlockMutation.mutate({
          amount,
          // action is disabled below if these is undefined
          mainStakeAccount: mainStakeAccount!,
          stakeConnection: stakeConnection!,
        })
      }
      actionLabel={'Unstake'}
      isActionLoading={unlockMutation.isLoading}
      isBalanceLoading={
        isStakeConnectionLoading || isAccountsLoading || isBalanceLoading
      }
      balance={lockedPythBalance}
      isActionDisabled={
        !mainStakeAccount ||
        stakeConnection === undefined ||
        accountWithLockedTokens
      }
      tooltipContentOnDisabled={
        accountWithLockedTokens
          ? 'You are currently not enrolled in governance.'
          : undefined
      }
    />
  )
}
