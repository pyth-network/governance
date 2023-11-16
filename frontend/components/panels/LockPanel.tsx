import { tabDescriptions } from 'pages/staking'
import { BasePanel } from './BasePanel'
import { useDepositMutation } from 'hooks/useDepositMutation'
import { StakeAccount } from '@pythnetwork/staking'
import { usePythBalance } from 'hooks/usePythBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'

type LockPanelProps = {
  mainStakeAccount: StakeAccount | undefined
}
export function LockPanel({ mainStakeAccount }: LockPanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const depositMutation = useDepositMutation()
  const { data: stakeConnection } = useStakeConnection()
  const { data: pythBalance, isLoading } = usePythBalance()

  return (
    <BasePanel
      description={tabDescriptions.Lock}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        depositMutation.mutate({
          amount,
          // action is disabled below if these is undefined
          mainStakeAccount: mainStakeAccount!,
          stakeConnection: stakeConnection!,
        })
      }
      actionLabel={'Lock'}
      isActionLoading={depositMutation.isLoading}
      isBalanceLoading={isLoading}
      balance={pythBalance}
      isActionDisabled={
        mainStakeAccount === undefined || stakeConnection === undefined
      }
    />
  )
}
