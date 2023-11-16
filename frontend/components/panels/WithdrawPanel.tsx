import { tabDescriptions } from 'pages/staking'
import { BasePanel } from './BasePanel'
import { StakeAccount } from '@pythnetwork/staking'
import { useBalance } from 'hooks/useBalance'
import { useWithdrawMutation } from 'hooks/useWithdrawMutation'
import { useStakeConnection } from 'hooks/useStakeConnection'

type WithdrawPanelProps = {
  mainStakeAccount: StakeAccount | undefined
}
export function WithdrawPanel({ mainStakeAccount }: WithdrawPanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const withdrawMutation = useWithdrawMutation()
  const { data: stakeConnection } = useStakeConnection()

  const { data: balanceData, isLoading } = useBalance(mainStakeAccount)
  const { unlockedPythBalance } = balanceData ?? {}

  return (
    <BasePanel
      description={tabDescriptions.Withdraw}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        withdrawMutation.mutate({
          // action enabled only when below two props are defined
          amount,
          mainStakeAccount: mainStakeAccount!,
          stakeConnection: stakeConnection!,
        })
      }
      actionLabel={'Locked Tokens'}
      isActionLoading={withdrawMutation.isLoading}
      isBalanceLoading={isLoading}
      balance={unlockedPythBalance}
      // TODO: when to disabled action not sure
      isActionDisabled={
        mainStakeAccount === undefined || stakeConnection === undefined
      }
    />
  )
}
