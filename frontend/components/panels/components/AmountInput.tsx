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
