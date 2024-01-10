import {
  ActionButton,
  AmountInput,
  AmountInputLabel,
} from '@components/panels/components'
import { BaseModal } from './BaseModal'
import { PythBalance } from '@pythnetwork/staking'
import { useState } from 'react'
import { validAmountChange } from 'utils/validAmountChange'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { isSufficientBalance as isSufficientBalanceFn } from 'utils/isSufficientBalance'
import { MainStakeAccount } from 'pages'

type LockedTokenActionModal = {
  isModalOpen: boolean
  setIsModalOpen: (open: boolean) => void
  title: string
  actionLabel: string
  mainStakeAccount: MainStakeAccount
  balance: PythBalance
  onAction: (amount: string) => void
}

export function LockedTokenActionModal({
  isModalOpen,
  setIsModalOpen,
  mainStakeAccount,
  title,
  actionLabel,
  balance,
  onAction,
}: LockedTokenActionModal) {
  const [amount, setAmount] = useState<string>('')
  const handleAmountChange = (amount: string) => {
    if (validAmountChange(amount)) setAmount(amount)
  }
  const { data: stakeConnection } = useStakeConnection()
  const isSufficientBalance = isSufficientBalanceFn(amount, balance)
  return (
    <BaseModal
      title={title}
      isModalOpen={isModalOpen}
      setIsModalOpen={setIsModalOpen}
    >
      {' '}
      <>
        <>
          <AmountInputLabel
            balance={balance}
            isBalanceLoading={false}
            setAmount={setAmount}
          />
          <AmountInput amount={amount} onAmountChange={handleAmountChange} />
        </>
        <ActionButton
          actionLabel={actionLabel}
          onAction={() => {
            onAction(amount)
          }}
          isActionDisabled={
            !isSufficientBalance ||
            mainStakeAccount === undefined ||
            stakeConnection === undefined
          }
          isActionLoading={false}
          tooltipContentOnDisabled={'Insufficient balance'}
        />
      </>
    </BaseModal>
  )
}
