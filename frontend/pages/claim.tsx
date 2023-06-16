import { ConnectKitButton, useSIWE } from 'connectkit'
import type { NextPage } from 'next'
import { useAccount, useNetwork } from 'wagmi'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const Claim: NextPage = () => {
  const { data, isSignedIn, signOut, signIn } = useSIWE()
  const { address, isConnecting, isDisconnected } = useAccount()
  const { chain } = useNetwork()
  return (
    <Layout>
      <SEO title={'Claim'} />
      <div className="mx-auto mt-2 mb-10 w-full max-w-[796px] sm:mt-12">
        <div className="mt-2 bg-darkGray px-4 sm:px-14 md:px-5">
          <div className="py-8">
            {isDisconnected ? (
              <div>Please connect wallet!</div>
            ) : (
              <>
                <div>Wallet connected!</div>
                <div>Address: {address}</div>
                {chain && <div>Chain: {chain.name}</div>}
                {isSignedIn && <div>Signed in with Ethereum!</div>}
              </>
            )}

            <div className="flex items-center justify-center py-2">
              <ConnectKitButton />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Claim
