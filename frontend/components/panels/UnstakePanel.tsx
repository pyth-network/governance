import { StakeAccount, VestingAccountState } from '@pythnetwork/staking'
import { useUnlockMutation } from 'hooks/useUnlockMutation'
import { useBalance } from 'hooks/useBalance'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'
import { useVestingAccountState } from 'hooks/useVestingAccountState'
import { MainStakeAccount } from 'pages'
import { WalletModalButton } from '@components/WalletModalButton'
import { useState } from 'react'
import { validAmountChange } from 'utils/validAmountChange'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  Layout,
  Description,
  AmountInputLabel,
  AmountInput,
  ActionButton,
} from './components'
import { isSufficientBalance as isSufficientBalanceFn } from 'utils/isSufficientBalance'

type UnstakePanelProps = {
  mainStakeAccount: MainStakeAccount
}

export function UnstakePanel({ mainStakeAccount }: UnstakePanelProps) {
  const { connected } = useWallet()
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
    vestingAccountState !== undefined &&
    vestingAccountState != VestingAccountState.FullyVested &&
    vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked

  const [amount, setAmount] = useState<string>('')

  const onAction = () =>
    unlockMutation.mutate({
      amount,
      // action is disabled below if these is undefined
      mainStakeAccount: mainStakeAccount as StakeAccount,
      stakeConnection: stakeConnection!,
    })

  // set amount when input changes
  const handleAmountChange = (amount: string) => {
    if (validAmountChange(amount)) setAmount(amount)
  }

  const isSufficientBalance = isSufficientBalanceFn(amount, lockedPythBalance)

  return (
    <Layout>
      <Description>
        Unstake PYTH. Unstaking tokens enables you to withdraw them from the
        program after a cooldown period of one epoch once the current epoch
        ends. (Epochs start every Thursday at 00:00 UTC and last 7 days).
        Unstaked tokens cannot participate in governance.
      </Description>
      {connected && (
        <>
          <AmountInputLabel
            isBalanceLoading={
              isStakeConnectionLoading || isAccountsLoading || isBalanceLoading
            }
            balance={lockedPythBalance}
            setAmount={setAmount}
          />
          <AmountInput amount={amount} onAmountChange={handleAmountChange} />
        </>
      )}

      <div className="flex items-center justify-center ">
        {!connected ? (
          <WalletModalButton />
        ) : (
          <ActionButton
            actionLabel={'Unstake'}
            onAction={onAction}
            isActionDisabled={
              !isSufficientBalance ||
              // if mainStakeAccount is undefined, the action should be disabled
              mainStakeAccount === undefined ||
              mainStakeAccount === 'NA' ||
              stakeConnection === undefined ||
              accountWithLockedTokens
            }
            isActionLoading={unlockMutation.isLoading}
            tooltipContentOnDisabled={
              !isSufficientBalance
                ? 'Insufficient Balance'
                : accountWithLockedTokens
                ? 'You are currently not enrolled in governance.'
                : undefined
            }
          />
        )}
      </div>
    </Layout>
  )
}
