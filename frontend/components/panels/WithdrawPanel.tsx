import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import { useBalance } from 'hooks/useBalance'
import { useWithdrawMutation } from 'hooks/useWithdrawMutation'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'
import { MainStakeAccount } from 'pages'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import { useCallback, useMemo, useState } from 'react'
import { validAmountChange } from 'utils/validAmountChange'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  Layout,
  Description,
  AmountInputLabel,
  AmountInput,
  ActionButton,
} from './components'

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

  const isSufficientBalance = useMemo(() => {
    if (amount && unlockedPythBalance) {
      if (PythBalance.fromString(amount).gt(unlockedPythBalance)) {
        return false
      } else {
        return true
      }
    } else {
      return true
    }
  }, [amount, unlockedPythBalance])

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
          <WalletModalButton
            style={{
              padding: '0 64px',
              border: 'solid',
              borderWidth: '1px',
              borderColor: 'rgb(113 66 207)',
              borderRadius: '9999px',
              whiteSpace: 'nowrap',
              background: 'rgb(113 66 207)',
              height: '45px',
            }}
          />
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
