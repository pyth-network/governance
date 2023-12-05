import { PythBalance } from '@pythnetwork/staking'

export function isSufficientBalance(
  amount: string,
  pythBalance: PythBalance | undefined
) {
  if (amount && pythBalance) {
    if (PythBalance.fromString(amount).gt(pythBalance)) {
      return false
    } else {
      return true
    }
  } else {
    return true
  }
}
