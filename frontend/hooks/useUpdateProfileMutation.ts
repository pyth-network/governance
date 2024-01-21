import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useMutation, useQueryClient } from 'react-query'
import {
  UserProfile,
  areDifferentProfiles,
} from '@pythnetwork/staking/lib/app/ProfileConnection'
import { useProfileConnection } from './useProfileConnection'
import { ProfileQueryKey } from './useProfile'

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient()
  const { data: profileConnection } = useProfileConnection()

  return useMutation(
    ['update-profile'],
    async ({
      currProfile,
      newProfile,
    }: {
      currProfile: UserProfile
      newProfile: UserProfile
    }) => {
      if (!profileConnection) {
        return
      }
      const diff = areDifferentProfiles(currProfile, newProfile)
      if (!diff) {
        toast.error('There is nothing to update.')
        return
      }
      try {
        await profileConnection.updateProfile(currProfile, newProfile)
        toast.success(
          `EVM address ${
            newProfile.evm === '' ? 'removed' : 'submitted'
          } successfully.`
        )
      } catch (e) {
        toast.error(e.message)
      }
    },
    {
      onSuccess() {
        queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] == ProfileQueryKey,
        })
      },
      onError(error: Error) {
        toast.error(capitalizeFirstLetter(error.message))
      },
    }
  )
}
