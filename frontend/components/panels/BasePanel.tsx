import Spinner from '@components/Spinner'
import Tooltip from '@components/Tooltip'
import { PythBalance } from '@pythnetwork/staking'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import BN from 'bn.js'
import { useState, ChangeEvent, useEffect } from 'react'

export type BasePanelProps = {
  description: string
  isBalanceLoading: boolean
  tokensLabel: string
  balance: PythBalance | undefined

  onAction: (amount: string) => void
  isActionLoading: boolean | undefined
  isActionDisabled: boolean | undefined
  actionLabel: string
}
export function BasePanel({
  description,
  isBalanceLoading,
  tokensLabel,
  balance,
  onAction,
  isActionLoading,
  isActionDisabled,
  actionLabel,
}: BasePanelProps) {
  const { connected } = useWallet()
  const [amount, setAmount] = useState<string>('')
  const [isSufficientBalance, setIsSufficientBalance] = useState<boolean>(true)

  useEffect(() => {
    if (amount && balance) {
      if (PythBalance.fromString(amount).gt(balance)) {
        setIsSufficientBalance(false)
      } else {
        setIsSufficientBalance(true)
      }
    } else {
      setIsSufficientBalance(true)
    }
  }, [amount])

  // set amount when input changes
  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const re = /^(\d*\.)?\d{0,6}$/
    if (re.test(event.target.value)) {
      setAmount(event.target.value)
    }
  }

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
    <div className="mx-auto max-w-xl text-center leading-6">
      <div className="mb-4 h-36  sm:mb-12 sm:h-16">{description}</div>

      {connected && (
        <>
          <div className="mb-4 flex items-end justify-between md:items-center ">
            <label htmlFor="amount" className="block ">
              Amount (PYTH)
            </label>
            <div className="ml-auto mr-0 flex flex-col-reverse items-end space-x-2 md:flex-row md:items-center">
              {isBalanceLoading ? (
                <div className="h-5 w-14  animate-pulse rounded-lg bg-darkGray4" />
              ) : (
                <p className="mt-2 md:mt-0">
                  {tokensLabel}: {connected ? balance?.toString() : '-'}
                </p>
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
          <input
            type="text"
            name="amount"
            id="amount"
            autoComplete="amount"
            value={amount}
            onChange={handleAmountChange}
            className="input-no-spin mb-8 mt-1 block h-14 w-full rounded-full bg-darkGray4 px-4 text-center text-lg font-semibold  focus:outline-none"
          />
        </>
      )}

      <div className="flex items-center justify-center ">
        {!connected ? (
          <WalletModalButton
            style={{
              padding: '0 18px',
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
          <button
            className="action-btn text-base "
            onClick={() => onAction(amount)}
            disabled={
              isActionDisabled || !isSufficientBalance || isActionLoading
            }
          >
            {isActionLoading ? (
              <Spinner />
            ) : isActionDisabled ? (
              <Tooltip content="You are currently not enrolled in governance.">
                {actionLabel}
              </Tooltip>
            ) : isSufficientBalance ? (
              actionLabel
            ) : (
              'Insufficient Balance'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
