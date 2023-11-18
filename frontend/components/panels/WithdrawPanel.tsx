import { BasePanel } from './BasePanel'
import { StakeAccount } from '@pythnetwork/staking'
import { useBalance } from 'hooks/useBalance'
import { useWithdrawMutation } from 'hooks/useWithdrawMutation'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'

type WithdrawPanelProps = {
  mainStakeAccount: StakeAccount | undefined | null
}

const Description =
  'Withdraw PYTH. Transfer tokens from the program to your wallet.'

export function WithdrawPanel({ mainStakeAccount }: WithdrawPanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const withdrawMutation = useWithdrawMutation()
  const { data: stakeConnection, isLoading: isStakeConnectionLoading } =
    useStakeConnection()
  const { isLoading: isAccountsLoading } = useStakeAccounts()
  const { data: balanceData, isLoading: isBalanceLoading } =
    useBalance(mainStakeAccount)

  const { unlockedPythBalance } = balanceData ?? {}

  return (
    <BasePanel
      description={Description}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        withdrawMutation.mutate({
          // action enabled only when below two props are defined
          amount,
          mainStakeAccount: mainStakeAccount!,
          stakeConnection: stakeConnection!,
        })
      }
      actionLabel={'Withdraw'}
      isActionLoading={withdrawMutation.isLoading}
      isBalanceLoading={
        isStakeConnectionLoading || isAccountsLoading || isBalanceLoading
      }
      balance={unlockedPythBalance}
      isActionDisabled={!mainStakeAccount || stakeConnection === undefined}
    />
  )
}
