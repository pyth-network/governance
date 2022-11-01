import { useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import Synaps from '@synaps-io/react-verify'
import type { NextPage } from 'next'
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const Airdrop: NextPage = () => {
  const { publicKey, connected } = useWallet()
  const [isVerified, setIsVerified] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [airdropRecipients, setAirdropRecipients] = useState<{
    [key: string]: number
  }>({})

  const fetchAirdropRecipients = async () => {
    const response = await fetch('http://0.0.0.0:8080/airdrop_recipients')
    const data = await response.json()
    setAirdropRecipients(data)
  }

  const fetchSessionInfo = async () => {
    const data = await fetch('http://0.0.0.0:8080/kyc', {
      method: 'POST',
      body: JSON.stringify({ address: publicKey?.toBase58() }),
      headers: {
        'Content-type': 'application/json; charset=UTF-8',
      },
    })
    const [sessionId, status] = await data.json()
    setSessionId(sessionId)
    setIsVerified(status === 'VERIFIED')
  }
  console.log(isVerified)

  useEffect(() => {
    if (connected) {
      fetchAirdropRecipients()
    }
  }, [connected])
  console.log(airdropRecipients)

  return (
    <Layout>
      <SEO title={'Airdrop'} />
      {connected &&
        publicKey &&
        publicKey.toBase58() in airdropRecipients &&
        sessionId && (
          <div className="mb-10 flex flex-col items-center px-8">
            <div className="w-full max-w-xl rounded-xl border-2 border-blueGem bg-jaguar py-6 sm:mt-12">
              <div className="mx-auto grid w-full text-center sm:text-left">
                <div className="text-white sm:grid sm:px-6">
                  <div className="my-auto flex flex-col">
                    <div className="mx-auto flex text-sm sm:m-0">
                      Congratulations, you are eligible to claim&nbsp;
                      <strong>
                        {airdropRecipients[publicKey.toBase58()]} PYTH
                      </strong>
                      &nbsp;tokens!
                    </div>
                  </div>
                </div>
                <div className="text-white sm:grid sm:grid-cols-2 sm:px-6">
                  <div className="my-auto flex flex-col">
                    <div className="mx-auto flex text-sm sm:m-0">
                      Verified:{' '}
                      {sessionId ? (isVerified ? 'true' : 'false') : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      <div className="mb-10 flex items-center justify-center font-inter">
        {connected && sessionId ? (
          <Synaps
            sessionId={sessionId}
            service={'individual'}
            lang={'en'}
            onReady={() => console.log('component ready')}
            onFinish={() => console.log('user finish process')}
            color={{
              primary: '212b39',
              secondary: 'ffffff',
            }}
          />
        ) : connected ? (
          <button
            className="primary-btn w-1/6 py-3 px-8 text-base font-semibold text-white hover:bg-blueGemHover"
            onClick={fetchSessionInfo}
          >
            Claim Airdrop
          </button>
        ) : (
          <WalletModalButton
            className="primary-btn py-3 px-14"
            text-base
            font-semibold
          />
        )}
      </div>
    </Layout>
  )
}

export default Airdrop
