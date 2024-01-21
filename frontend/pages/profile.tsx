import Spinner from '@components/Spinner'
import { WalletModalButton } from '@components/WalletModalButton'
import { ActionButton } from '@components/panels/components'
import { useWallet } from '@solana/wallet-adapter-react'
import type { NextPage } from 'next'
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { useProfile } from 'hooks/useProfile'
import { useUpdateProfileMutation } from 'hooks/useUpdateProfileMutation'

const Profile: NextPage = () => {
  const { connected } = useWallet()
  const [evmAddress, setEvmAddress] = useState<string>()
  const { data: profile, isLoading: isProfileLoading } = useProfile()
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setEvmAddress(profile?.evm)
  }, [profile])

  const updateProfile = useUpdateProfileMutation()

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
              !isProfileLoading && profile ? (
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
                        setEvmAddress(e.target.value)
                      }}
                    />
                  </div>
                  <div className="mt-8 flex items-center justify-center">
                    <ActionButton
                      actionLabel={'Submit'}
                      onAction={() =>
                        updateProfile.mutate({
                          currProfile: profile,
                          newProfile: { evm: evmAddress },
                        })
                      }
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
