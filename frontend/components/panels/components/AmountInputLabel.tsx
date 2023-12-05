import { PythBalance } from '@pythnetwork/staking'
import BN from 'bn.js'

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
