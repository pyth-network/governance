import { useQuery } from 'react-query'
import { useProfileConnection } from './useProfileConnection'
import { UserProfile } from '@pythnetwork/staking/lib/app/ProfileConnection'

export const ProfileQueryKey = 'profile'

export function useProfile() {
  const { data: profileConnection } = useProfileConnection()

  return useQuery(
    [ProfileQueryKey, profileConnection?.userPublicKey().toString()],
    async () => {
      return await profileConnection?.getProfile(
        profileConnection.userPublicKey()
      )
    },
    {
      // we should only fetch when profile connection is defined
      enabled: profileConnection !== undefined,
    }
  )
}
