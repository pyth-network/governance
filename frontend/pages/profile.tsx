import Spinner from '@components/Spinner'
import { WalletModalButton } from '@components/WalletModalButton'
import { ActionButton } from '@components/panels/components'
import { ProfileConnection } from '@pythnetwork/staking'
import {
  UserProfile,
  areDifferentProfiles,
} from '@pythnetwork/staking/lib/app/ProfileConnection'
import { useWallet } from '@solana/wallet-adapter-react'
import { useProfileConnection } from 'hooks/useProfileConnection'
import { useStakeConnection } from 'hooks/useStakeConnection'
import type { NextPage } from 'next'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const Profile: NextPage = () => {
  const { connected } = useWallet()
  const [evmAddress, setEvmAddress] = useState<string>()
  const { data: stakeConnection } = useStakeConnection()
  const { data: profileConnection, isLoading: isProfileConnectionLoading } =
    useProfileConnection(stakeConnection)
  const [profile, setProfile] = useState<UserProfile>({})
  const [isProfileLoading, setIsProfileLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!profileConnection || !stakeConnection) return
    const getProfile = async () => {
      const profile = await profileConnection.getProfile(
        stakeConnection.userPublicKey()
      )
      setProfile(profile)
      setIsProfileLoading(false)
      setEvmAddress(profile['evm'])
    }
    getProfile()
  }, [profileConnection, stakeConnection])

  const updateProfile = async () => {
    if (!stakeConnection) return
    setIsSubmitting(true)
    let profileConnection = new ProfileConnection(
      stakeConnection.provider.connection,
      stakeConnection.provider.wallet
    )
    let profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    )
    const diff = areDifferentProfiles(profile, { evm: evmAddress })
    if (!diff) {
      toast.error('There is nothing to update.')
      setIsSubmitting(false)
      return
    }

    try {
      await profileConnection.updateProfile(profile, { evm: evmAddress })
      toast.success(
        `EVM address ${
          evmAddress === '' ? 'removed' : 'submitted'
        } successfully.`
      )
    } catch (e) {
      toast.error(e.message)
    }
    profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    )

    setProfile(profile)
    setIsSubmitting(false)
  }

  return (
    <Layout>
      <SEO title={'Profile'} />
      <div className="mx-8 mt-10 flex min-h-screen justify-center sm:mt-40">
        <div className="w-full max-w-[600px]">
          <div className="space-y-2">
            <h2 className="mb-12 font-body text-[44px] font-light leading-10 -tracking-[.03em]">
              Pyth Profile
            </h2>
          </div>
          <div className="bg-[#252236] px-8 py-8">
            {connected ? (
              !isProfileConnectionLoading && !isProfileLoading ? (
                <>
                  <div className="space-y-2">
                    <p className="mb-4 text-[14px] font-medium leading-[18.2px] tracking-[.03em]">
                      EVM Address
                    </p>
                    <input
                      className="flex h-10 w-full rounded-md border-none bg-[#312F47] px-3 py-2 text-sm outline-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      id="evm-address"
                      placeholder="Enter your EVM address"
                      autoComplete="off"
                      defaultValue={profile['evm']}
                      onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
                        console.log('onChange triggered')
                        setEvmAddress(e.target.value)
                      }}
                    />
                  </div>
                  <div className="mt-8 flex items-center justify-center">
                    <ActionButton
                      actionLabel={'Submit'}
                      onAction={() => {
                        updateProfile()
                      }}
                      isActionDisabled={false}
                      isActionLoading={isSubmitting}
                      tooltipContentOnDisabled={''}
                    />
                  </div>
                </>
              ) : (
                <div className="mt-8 flex items-center justify-center">
                  <Spinner />
                </div>
              )
            ) : (
              <div className="mt-8 flex items-center justify-center">
                <WalletModalButton />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Profile
