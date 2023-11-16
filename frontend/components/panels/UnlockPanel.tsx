import { tabDescriptions } from 'pages/staking'
import { BasePanel } from './BasePanel'
import { StakeAccount } from '@pythnetwork/staking'
import { useUnlockMutation } from 'hooks/useUnlockMutation'
import { useBalance } from 'hooks/useBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'

type UnlockPanelProps = {
  mainStakeAccount: StakeAccount | undefined
}
export function UnlockPanel({ mainStakeAccount }: UnlockPanelProps) {
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const unlockMutation = useUnlockMutation()
  const { data: stakeConnection } = useStakeConnection()
  const { data: balanceData, isLoading } = useBalance(mainStakeAccount)
  const { lockedPythBalance } = balanceData ?? {}

  return (
    <BasePanel
      description={tabDescriptions.Unlock}
      tokensLabel={'Balance'}
      onAction={(amount) =>
        unlockMutation.mutate({
          amount,
          // action is disabled below if these is undefined
          mainStakeAccount: mainStakeAccount!,
          stakeConnection: stakeConnection!,
        })
      }
      actionLabel={'Locked Tokens'}
      isActionLoading={unlockMutation.isLoading}
      isBalanceLoading={isLoading}
      balance={lockedPythBalance}
      isActionDisabled={
        mainStakeAccount === undefined || stakeConnection === undefined
      }
    />
  )
}
