import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { StakeAccount } from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'

const CreateElectionGovernance: NextPage = () => {
  const { data: stakeConnection } = useStakeConnection()
  const { data: stakeAccounts } = useStakeAccounts()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()

  useEffect(() => {
    if (stakeAccounts && stakeAccounts.length > 0)
      setSelectStakeAccount(stakeAccounts[0])
  }, [stakeAccounts])

  const createElectionGovernance = async () => {
    if (stakeConnection && selectedStakeAccount)
      try {
        await stakeConnection.createElectionGovernance(selectedStakeAccount)
        toast.success('Successfully created election governance')
      } catch (err) {
        toast.error(capitalizeFirstLetter(err.message))
      }
  }

  return (
    <Layout>
      <SEO title={'Create election governance'} />
      {stakeConnection ? (
        <p>
          <button
            className="rounded-full p-2 hover:bg-hoverGray"
            onClick={() => createElectionGovernance()}
          >
            Click to approve
          </button>
        </p>
      ) : (
        <p className="p-2 hover:bg-hoverGray"> Please connect wallet</p>
      )}
    </Layout>
  )
}

export default CreateElectionGovernance
