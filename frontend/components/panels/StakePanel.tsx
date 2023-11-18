import { BasePanel } from './BasePanel'
import { useDepositMutation } from 'hooks/useDepositMutation'
import { StakeAccount } from '@pythnetwork/staking'
import { usePythBalance } from 'hooks/usePythBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'

type StakePanelProps = {
  mainStakeAccount: StakeAccount | undefined | null
}

const Description =
  'Deposit and stake PYTH. Staking tokens enables you to participate in Pyth Network governance. Newly-staked tokens become eligible to vote in governance at the beginning of the next epoch.'

export function StakePanel({ mainStakeAccount }: StakePanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const depositMutation = useDepositMutation()
  const { data: stakeConnection, isLoading: isStakeConnectionLoading } =
    useStakeConnection()
  const { data: pythBalance, isLoading: isPythBalanceLoading } =
    usePythBalance()

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
      isActionDisabled={stakeConnection === undefined}
    />
  )
}
