import { tabDescriptions } from 'pages/staking'
import { BasePanel } from './BasePanel'
import { useDepositMutation } from 'hooks/useDepositMutation'
import { StakeAccount } from '@pythnetwork/staking'
import { usePythBalance } from 'hooks/usePythBalance'

type LockPanelProps = {
  mainStakeAccount: StakeAccount | undefined
}
export function LockPanel({ mainStakeAccount }: LockPanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const depositMutation = useDepositMutation()
  const { data: pythBalance, isLoading } = usePythBalance()

  console.log(isLoading, pythBalance)

  return (
    <BasePanel
      description={tabDescriptions.Lock}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        depositMutation.mutate({ amount, mainStakeAccount })
      }
      actionLabel={'Lock'}
      isActionLoading={depositMutation.isLoading}
      isBalanceLoading={isLoading}
      balance={pythBalance}
      // TODO: when to disabled action not sure
      isActionDisabled={undefined}
    />
  )
}
