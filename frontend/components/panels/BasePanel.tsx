import Spinner from '@components/Spinner'
import Tooltip from '@components/Tooltip'
import { PythBalance } from '@pythnetwork/staking'
import BN from 'bn.js'
import { ReactNode } from 'react'

export type AmountInputLabelProps = {
  balance: PythBalance | undefined
  isBalanceLoading: boolean
  setAmount: (amount: string) => void
}
export function AmountInputLabel({
  setAmount,
  isBalanceLoading,
  balance,
}: AmountInputLabelProps) {
  // set input amount to half of pyth balance in wallet
  const handleHalfBalanceClick = () => {
    if (balance) {
      setAmount(new PythBalance(balance.toBN().div(new BN(2))).toString())
    }
  }

  // set input amount to max of pyth balance in wallet
  const handleMaxBalanceClick = () => {
    if (balance) {
      setAmount(balance.toString())
    }
  }

  return (
    <div className="mb-4 flex items-end justify-between md:items-center ">
      <label htmlFor="amount" className="block ">
        Amount (PYTH)
      </label>
      <div className="ml-auto mr-0 flex flex-col-reverse items-end space-x-2 md:flex-row md:items-center">
        {isBalanceLoading ? (
          <div className="h-5 w-14  animate-pulse rounded-lg bg-darkGray4" />
        ) : (
          <p className="mt-2 md:mt-0">Balance: {balance?.toString()}</p>
        )}
        <div className="mb-2  flex space-x-2 md:mb-0">
          <button
            className="outlined-btn hover:bg-darkGray4"
            onClick={handleHalfBalanceClick}
          >
            Half
          </button>
          <button
            className="outlined-btn hover:bg-darkGray4"
            onClick={handleMaxBalanceClick}
          >
            Max
          </button>
        </div>
      </div>
    </div>
  )
}

export type AmountInputProps = {
  amount: string
  onAmountChange: (amount: string) => void
}
export function AmountInput({ amount, onAmountChange }: AmountInputProps) {
  return (
    <input
      type="text"
      name="amount"
      id="amount"
      autoComplete="amount"
      value={amount}
      onChange={(e) => onAmountChange(e.target.value)}
      className="input-no-spin mb-8 mt-1 block h-14 w-full rounded-full bg-darkGray4 px-4 text-center text-lg font-semibold  focus:outline-none"
    />
  )
}

export type ActionButtonProps = {
  actionLabel: string
  onAction: () => void
  isActionDisabled: boolean | undefined
  isActionLoading: boolean | undefined
  tooltipContentOnDisabled?: string
}
export function ActionButton({
  actionLabel,
  onAction,
  isActionDisabled,
  isActionLoading,
  tooltipContentOnDisabled,
}: ActionButtonProps) {
  return (
    <button
      className="action-btn text-base "
      onClick={onAction}
      disabled={isActionDisabled || isActionLoading}
    >
      {isActionLoading ? (
        <Spinner />
      ) : isActionDisabled ? (
        <Tooltip content={tooltipContentOnDisabled}>{actionLabel}</Tooltip>
      ) : (
        actionLabel
      )}
    </button>
  )
}

export function PanelDescription({ children }: { children: string }) {
  return <div className="mb-4 h-36  sm:mb-12 sm:h-16">{children}</div>
}

export function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl text-center leading-6">{children}</div>
  )
}
