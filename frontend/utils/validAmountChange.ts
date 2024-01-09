export function validAmountChange(amount: string): boolean {
  const re = /^\d*\.?\d{0,6}$/
  if (re.test(amount)) {
    return true
  }
  return false
}
