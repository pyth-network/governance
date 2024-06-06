import type { NextPage } from 'next'
import {
  Description,
  Layout as PanelLayout,
} from '../components/panels/components'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'

const Test: NextPage = () => {
  const { data: stakeConnection } = useStakeConnection()

  const [hasTested, setHasTested] = useState<boolean>(false)

  useEffect(() => {
    const loadWalletHasTested = async () => {
      if (stakeConnection) {
        const tested = await stakeConnection.walletHasTested(
          stakeConnection.userPublicKey()
        )
        setHasTested(tested)
      }
    }
    loadWalletHasTested()
  }, [stakeConnection])

  const testWallet = async () => {
    if (stakeConnection)
      try {
        await stakeConnection.testWallet()
        toast.success('Successfully tested wallet, thank you!')
      } catch (err) {
        toast.error(capitalizeFirstLetter(err.message))
      }
  }

  return (
    <Layout>
      <SEO title={'Wallet Compatiblity Test'} />

      <PanelLayout>
        {stakeConnection ? (
          <p>
            {hasTested ? (
              <Description>
                Your wallet has already been tested succesfully.
              </Description>
            ) : (
              <Description>
                Please click the button below and accept the transaction in your
                wallet to test the browser wallet compatibility. You will need
                0.001 SOL.
              </Description>
            )}
            <button
              className="action-btn text-base"
              onClick={() => testWallet()}
            >
              Click to test
            </button>
          </p>
        ) : (
          <p className="p-2 hover:bg-hoverGray"> Please connect your wallet</p>
        )}
      </PanelLayout>
    </Layout>
  )
}

export default Test
