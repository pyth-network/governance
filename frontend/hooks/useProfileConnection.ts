import { Wallet } from '@coral-xyz/anchor'
import { ProfileConnection } from '@pythnetwork/staking'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import toast from 'react-hot-toast'
import { useQuery } from 'react-query'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const ProfileConnectionQueryKey = 'create-profile-connection'
export function useProfileConnection() {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()

  return useQuery(
    [ProfileConnectionQueryKey, anchorWallet?.publicKey.toString()],
    async () => {
      return new ProfileConnection(connection, anchorWallet as Wallet)
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
