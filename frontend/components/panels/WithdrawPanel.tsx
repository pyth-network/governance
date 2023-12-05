import { StakeAccount } from '@pythnetwork/staking'
import { useBalance } from 'hooks/useBalance'
import { useWithdrawMutation } from 'hooks/useWithdrawMutation'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'
import { MainStakeAccount } from 'pages'
import { WalletModalButton } from '@components/WalletModalButton'
import { useCallback, useState } from 'react'
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

type WithdrawPanelProps = {
  mainStakeAccount: MainStakeAccount
}

export function WithdrawPanel({ mainStakeAccount }: WithdrawPanelProps) {
  const { connected } = useWallet()
  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const withdrawMutation = useWithdrawMutation()
  const { data: stakeConnection, isLoading: isStakeConnectionLoading } =
    useStakeConnection()
  const { isLoading: isAccountsLoading } = useStakeAccounts()
  const { data: balanceData, isLoading: isBalanceLoading } =
    useBalance(mainStakeAccount)

  const { unlockedPythBalance } = balanceData ?? {}

  const [amount, setAmount] = useState<string>('')
  // set amount when input changes
  const handleAmountChange = (amount: string) => {
    if (validAmountChange(amount)) setAmount(amount)
  }

  const isSufficientBalance = isSufficientBalanceFn(amount, unlockedPythBalance)

  const onAction = useCallback(() => {
    withdrawMutation.mutate({
      amount,
      // action enabled only when the two props are defined
      mainStakeAccount: mainStakeAccount as StakeAccount,
      stakeConnection: stakeConnection!,
    })
  }, [])

  return (
    <Layout>
      <Description>
        Withdraw PYTH. Transfer tokens from the program to your wallet.
      </Description>
      {connected && (
        <>
          <AmountInputLabel
            balance={unlockedPythBalance}
            isBalanceLoading={
              isStakeConnectionLoading || isAccountsLoading || isBalanceLoading
            }
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
            actionLabel={'Withdraw'}
            onAction={onAction}
            isActionDisabled={
              !isSufficientBalance ||
              // if mainStakeAccount is undefined, the action should be disabled
              mainStakeAccount === undefined ||
              mainStakeAccount === 'NA' ||
              stakeConnection === undefined
            }
            isActionLoading={withdrawMutation.isLoading}
            tooltipContentOnDisabled={
              !isSufficientBalance ? 'Insufficient Balance' : undefined
            }
          />
        )}
      </div>
    </Layout>
  )
}
