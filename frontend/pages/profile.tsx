import { ActionButton } from '@components/panels/components'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import type { NextPage } from 'next'
import { useState } from 'react'
import toast from 'react-hot-toast'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const Profile: NextPage = () => {
  const { connected } = useWallet()
  const [evmAddress, setEvmAddress] = useState('')
  const [error, setError] = useState(false)

  const validateEVMAddress = () => {
    const re = /^0x[a-fA-F0-9]{40}$/
    if (!re.test(evmAddress)) {
      toast.error('Invalid EVM Address')
      setError(true)
    } else {
      setError(false)
    }
  }

  return (
    <Layout>
      <SEO title={'Profile'} />
      <div className="mx-8 mt-10 flex min-h-screen justify-center sm:mt-40">
        <div className="w-full max-w-[600px]">
          <div className="space-y-2">
            <h2 className="mb-12 font-redHatDisplay text-[36px] font-light leading-10 tracking-[.03em]">
              Pyth Profile
            </h2>
          </div>
          <div className="bg-[#252236] px-8 py-8">
            <div className="space-y-2">
              <p className="mb-4 text-[14px] font-medium leading-[18.2px] tracking-[.03em]">
                EVM Address
              </p>
              <input
                className="flex h-10 w-full rounded-md border-none bg-[#312F47] px-3 py-2 text-sm outline-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                id="evm-address"
                placeholder="Enter your EVM address"
                autoComplete="off"
                onChange={(e) => setEvmAddress(e.target.value)}
              />
            </div>
            <div className="mt-8 flex items-center justify-center">
              {!connected ? (
                <WalletModalButton />
              ) : (
                <ActionButton
                  actionLabel={'Submit'}
                  onAction={() => {
                    validateEVMAddress()
                    if (!error) {
                      console.log('submit')
                    }
                  }}
                  isActionDisabled={false}
                  isActionLoading={false}
                  tooltipContentOnDisabled={''}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Profile
