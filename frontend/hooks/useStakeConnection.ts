import { Wallet } from '@coral-xyz/anchor'
import { STAKING_ADDRESS, StakeConnection } from '@pythnetwork/staking'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import toast from 'react-hot-toast'
import { useQuery } from 'react-query'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const StakeConnectionQueryKey = 'create-stake-connection'
export function useStakeConnection() {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()

  return useQuery(
    [StakeConnectionQueryKey, anchorWallet?.publicKey.toString()],
    async () => {
      return await StakeConnection.createStakeConnection(
        connection,
        // anchor wallet is defined, as we have used enabled below
        anchorWallet as Wallet,
        STAKING_ADDRESS
      )
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },
      // we should only fetch when anchor wallet is defined
      enabled: anchorWallet !== undefined,
    }
  )
}
