// frontend/hooks/useProfileConnection.ts
import { ProfileConnection, StakeConnection } from '@pythnetwork/staking'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import toast from 'react-hot-toast'
import { useQuery } from 'react-query'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export const ProfileConnectionQueryKey = 'create-profile-connection'
export function useProfileConnection(stakeConnection?: StakeConnection) {
  const anchorWallet = useAnchorWallet()

  return useQuery(
    [ProfileConnectionQueryKey, anchorWallet?.publicKey.toString()],
    async () => {
      if (!stakeConnection) {
        return undefined
      }
      return new ProfileConnection(
        stakeConnection.provider.connection,
        stakeConnection.provider.wallet
      )
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },
      // we should only fetch when anchor wallet and stakeConnection are defined
      enabled: anchorWallet !== undefined && stakeConnection !== undefined,
    }
  )
}
