import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import { StakeAccount } from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useSplitRequest } from 'hooks/useSplitRequest'

const ApproveSplit: NextPage = () => {
  const anchorWallet = useAnchorWallet()

  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()

  const { data: splitRequest } = useSplitRequest(selectedStakeAccount)
  const { data: stakeConnection } = useStakeConnection()

  const router = useRouter()
  const { owner } = router.query

  const handleSelectStakeAccount = (event: any) => {
    for (const stakeAccount of stakeAccounts!) {
      if (stakeAccount.address.toString() === event.target.value) {
        setSelectStakeAccount(stakeAccount)
        break
      }
    }
  }

  useEffect(() => {
    const loadStakeAccounts = async () => {
      if (stakeConnection && anchorWallet) {
        const stakeAccounts = await stakeConnection.getStakeAccounts(
          new PublicKey(owner!)
        )
        setStakeAccounts(stakeAccounts)
      } else {
        setStakeAccounts(undefined)
      }
    }
    loadStakeAccounts()
  }, [stakeConnection])

  useEffect(() => {
    if (stakeAccounts && stakeAccounts.length > 0)
      setSelectStakeAccount(stakeAccounts[0])
  }, [stakeAccounts])

  const approveSplit = async () => {
    if (stakeConnection && selectedStakeAccount && splitRequest) {
      try {
        const ephemeralAccount = new PublicKey(
          'FUYcu4W2pa2MuKhMTvbwsBYJS2kaLyJwwbQHkSeiSYjd'
        )
        await stakeConnection.acceptSplit(
          selectedStakeAccount,
          splitRequest.balance,
          splitRequest.recipient,
          ephemeralAccount
        )
        toast.success('Successfully accepted transfer request')
      } catch (err) {
        toast.error(capitalizeFirstLetter(err.message))
      }
    }
  }

  return (
    <Layout>
      <SEO title={'Approve Split'} />
      <p className=" text-sm ">Approve a split request from {owner}</p>
      <p>
        {stakeConnection &&
          stakeAccounts !== undefined &&
          stakeAccounts.length > 0 && (
            <div>
              <select
                style={{ color: 'black' }}
                value={selectedStakeAccount?.address.toString()}
                onChange={handleSelectStakeAccount}
              >
                {stakeAccounts.map((option, index) => (
                  <option key={index} value={option.address.toBase58()}>
                    {option.address.toString()}
                  </option>
                ))}
              </select>
            </div>
          )}
        {selectedStakeAccount != undefined
          ? `stake account address: ${selectedStakeAccount.address}`
          : 'no owner'}
      </p>
      <p>
        {splitRequest != undefined
          ? `amount: ${splitRequest.balance}`
          : 'no amount'}
      </p>
      <p>
        {splitRequest != undefined
          ? `recipient: ${splitRequest.recipient}`
          : 'no recipient'}
      </p>
      <button
        className="rounded-full p-2 hover:bg-hoverGray"
        onClick={() => approveSplit()}
      >
        Click to approve
      </button>
    </Layout>
  )
}

export default ApproveSplit
