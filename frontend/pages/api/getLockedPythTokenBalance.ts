import { PublicKey } from '@solana/web3.js'
import { StakeConnection } from '../../../staking-ts/src/StakeConnection'

export const getLockedPythTokenBalance = async (
  stakeConnection: StakeConnection,
  publicKey: PublicKey
) => {
  const stakeAccounts = await stakeConnection.getStakeAccounts(publicKey)
  let lockedTokens = 0
  if (stakeAccounts.length > 0) {
    const positions = stakeAccounts[0].stake_account_positions.positions
    for (const pos of positions) {
      if (pos) {
        lockedTokens += pos.amount.toNumber()
      }
    }
  }
  return lockedTokens
}
