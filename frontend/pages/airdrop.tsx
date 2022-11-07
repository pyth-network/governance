import RotateIcon from '@components/icons/RotateIcon'
import WhiteDiscordIcon from '@components/icons/WhiteDiscordIcon'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import Synaps from '@synaps-io/react-verify'
import type { NextPage } from 'next'
import { signIn, signOut, useSession } from 'next-auth/client'
import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

const Airdrop: NextPage = () => {
  const { publicKey, connected } = useWallet()
  const [session, loading] = useSession()
  const [isVerified, setIsVerified] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [eligible, setEligible] = useState(false)
  const [amount, setAmount] = useState(0)
  const [kycFrame, setKycFrame] = useState(false)

  const setEligibility = async () => {
    const response = await fetch('http://0.0.0.0:8080/airdrop_recipients')
    const data = await response.json()
    let airdropAmount = 0
    if (
      publicKey &&
      publicKey.toBase58() in data &&
      data[publicKey.toBase58()] > 0
    ) {
      setEligible(true)
      airdropAmount += data[publicKey.toBase58()]
    }

    if (
      session &&
      session.user &&
      session.user.name &&
      session.user.name in data &&
      data[session.user.name] > 0
    ) {
      setEligible(true)
      airdropAmount += data[session.user.name]
    }

    setAmount(airdropAmount)
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

  useEffect(() => {
    if (connected) {
      setEligibility()
    }
  }, [connected, session])

  useEffect(() => {
    if (connected) {
      fetchSessionInfo()
    }
  }, [eligible])

  return (
    <Layout>
      <SEO title={'Airdrop'} />
      <div className="mb-10 flex flex-col items-center justify-center font-inter">
        <div className="mb-10 flex flex-col items-center px-8">
          <div className="px-20 text-center font-bold text-white">
            {session ? `Connected: ${session?.user?.name}` : null}
            <div className="max-w-sm">
              {session ? (
                <button
                  className="discord-btn w-full py-3 px-8 text-base text-white hover:bg-blueGemHover"
                  onClick={() => signOut()}
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="discord-btn flex w-full py-3 px-8 text-base text-white hover:bg-blueGemHover"
                  onClick={() => signIn('discord')}
                >
                  <WhiteDiscordIcon /> &nbsp;Sign In with Discord
                </button>
              )}
            </div>
          </div>
        </div>
        {connected && !eligible ? (
          <div className="mb-10 flex flex-col items-center px-8">
            <div className="px-20 text-center text-8xl font-bold text-white">
              Sorry, you’re not eligible to claim this $PYTH airdrop.
            </div>
            <div className="py-10 px-40 text-center text-sm text-white">
              It looks like this wallet is not eligible for the airdrop. Try
              connecting another wallet.
            </div>
            <WalletModalButton
              className="primary-btn py-3 px-14"
              text-base
              font-semibold
            >
              <RotateIcon />
              &nbsp; Connect Different Wallet
            </WalletModalButton>
          </div>
        ) : connected && eligible && isVerified ? (
          <div className="mb-10 flex flex-col items-center px-8">
            <div className="px-20 text-center text-6xl font-bold text-white">
              Congratulations, you have completed KYC and are verified!
            </div>
            <div className="py-10 px-40 text-center text-sm text-white">
              Claim your {amount} $PYTH tokens.
            </div>
            <div className="max-w-sm">
              <button
                className="primary-btn w-full py-3 px-8 text-base font-semibold text-white hover:bg-blueGemHover"
                onClick={() => {}}
              >
                Claim Airdrop
              </button>
            </div>
          </div>
        ) : connected && eligible && !isVerified ? (
          kycFrame ? (
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
          ) : (
            <div className="mb-10 flex flex-col items-center px-8">
              <div className="px-20 text-center text-6xl font-bold text-white">
                Congratulations, you are eligible to claim&nbsp;
                <strong>{amount} $PYTH</strong>
                &nbsp;tokens!
              </div>
              <div className="py-10 px-40 text-center text-sm text-white">
                Please complete KYC to receive your tokens.
              </div>
              <div className="max-w-sm">
                <button
                  className="primary-btn w-full py-3 px-8 text-base font-semibold text-white hover:bg-blueGemHover"
                  onClick={() => setKycFrame(true)}
                >
                  Complete KYC
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="mb-10 flex flex-col items-center px-8">
            <div className="px-20 text-center text-8xl font-bold text-white">
              Claim your $PYTH Airdrop
            </div>
            <div className="py-10 px-40 text-center text-sm text-white">
              The Pyth Token ($PYTH) is the governance and utility token for the
              Pyth Network, which serves as the backbone to the Solana DeFi
              ecosystem. To start, holders of $PYTH may vote in the Pyth DAO to
              participate directly in the future direction of the protocol.
            </div>
            <WalletModalButton
              className="primary-btn py-3 px-14"
              text-base
              font-semibold
            />
          </div>
        )}
      </div>
    </Layout>
  )
}

export default Airdrop
