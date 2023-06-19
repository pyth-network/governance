import { ConnectKitButton, useSIWE } from 'connectkit'
import type { NextPage } from 'next'
import { useEffect, useState } from 'react'
import { recoverMessageAddress } from 'viem'
import { useAccount, useNetwork, useSignMessage } from 'wagmi'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const MESSAGE = 'Pyth Grant Program'

const Claim: NextPage = () => {
  const [recoveredAddress, setRecoveredAddress] = useState<string>()
  const { data: signMessageData, signMessage, variables } = useSignMessage()
  const { isSignedIn } = useSIWE()
  const { address, isDisconnected } = useAccount()
  const { chain } = useNetwork()

  useEffect(() => {
    const verifyMessage = async () => {
      if (variables?.message && signMessageData) {
        const recoveredAddress = await recoverMessageAddress({
          message: variables?.message,
          signature: signMessageData,
        })
        // alternatively, you can use ethers verifyMessage
        // const MESSAGE_BYTES = toUtf8Bytes(MESSAGE)
        // const recoveredAddress = verifyMessage(MESSAGE_BYTES, signMessageData)
        setRecoveredAddress(recoveredAddress)
      }
    }

    verifyMessage()
    if (recoveredAddress && address) {
      if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
        console.log('Signature is valid')
      } else {
        console.log('Signature is invalid')
      }
    }
  }, [recoveredAddress, address, signMessageData, variables?.message])

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
                {recoveredAddress && (
                  <div>Recovered Address: {recoveredAddress}</div>
                )}
                {signMessageData && (
                  <div className="break-all">
                    Signature: {signMessageData.toString()}
                  </div>
                )}
              </>
            )}

            <div className="mt-2 flex items-center justify-center py-2">
              <ConnectKitButton />
            </div>

            <div className="my-2 flex justify-center md:mb-0">
              <button
                className="outlined-btn hover:bg-darkGray4"
                disabled={isDisconnected}
                onClick={() => signMessage({ message: MESSAGE })}
              >
                {isDisconnected ? 'Check Wallet' : 'Sign Message'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Claim
