import { PublicKey } from '@solana/web3.js'
import {
  StakeConnection,
} from '../../../staking-ts/src/StakeConnection'

export const getUnlockedPythTokenBalance = async (
  stakeConnection: StakeConnection,
  publicKey: PublicKey
) => {
  const stakeAccounts = await stakeConnection.getStakeAccounts(publicKey)
  const total_token_balance = stakeAccounts[0].token_balance.toNumber()
  const positions = stakeAccounts[0].stake_account_positions.positions
  let lockedTokens = 0
  for (const pos of positions) {
    if (pos) {
      lockedTokens += pos.amount.toNumber()
    }
  }
  return total_token_balance - lockedTokens
}
