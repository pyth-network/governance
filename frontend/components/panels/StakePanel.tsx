import { BasePanel } from './BasePanel'
import { useDepositMutation } from 'hooks/useDepositMutation'
import { VestingAccountState } from '@pythnetwork/staking'
import { usePythBalance } from 'hooks/usePythBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useVestingAccountState } from 'hooks/useVestingAccountState'
import { MainStakeAccount } from 'pages'

type StakePanelProps = {
  mainStakeAccount: MainStakeAccount
}

const Description =
  'Deposit and stake PYTH. Staking tokens enables you to participate in Pyth Network governance. Newly-staked tokens become eligible to vote in governance at the beginning of the next epoch. (Epochs start every Thursday at 00:00 UTC).'

export function StakePanel({ mainStakeAccount }: StakePanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const depositMutation = useDepositMutation()
  const { data: stakeConnection, isLoading: isStakeConnectionLoading } =
    useStakeConnection()
  const { data: pythBalance, isLoading: isPythBalanceLoading } =
    usePythBalance()

  const { data: vestingAccountState } = useVestingAccountState(mainStakeAccount)

  const accountWithLockedTokens =
    vestingAccountState !== undefined &&
    vestingAccountState != VestingAccountState.FullyVested &&
    vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked

  return (
    <BasePanel
      description={Description}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        depositMutation.mutate({
          amount,
          mainStakeAccount: mainStakeAccount,
          // action is disabled below if these is undefined
          stakeConnection: stakeConnection!,
        })
      }
      actionLabel={'Stake'}
      isActionLoading={depositMutation.isLoading}
      isBalanceLoading={isStakeConnectionLoading || isPythBalanceLoading}
      balance={pythBalance}
      isActionDisabled={
        stakeConnection === undefined || accountWithLockedTokens
      }
      tooltipContentOnDisabled={
        accountWithLockedTokens
          ? 'You are currently not enrolled in governance.'
          : undefined
      }
    />
  )
}
