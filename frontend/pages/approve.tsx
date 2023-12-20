import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import {
  PythBalance,
  StakeAccount,
  StakeConnection,
  STAKING_ADDRESS,
} from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { Wallet } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

const ApproveSplit: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const [amount, setAmount] = useState<PythBalance>()
  const [recipient, setRecipient] = useState<PublicKey>()

  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()

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
    const initialize = async () => {
      const stakeConnection = await StakeConnection.createStakeConnection(
        connection,
        anchorWallet as Wallet,
        STAKING_ADDRESS
      )
      setStakeConnection(stakeConnection)
    }

    if (!anchorWallet) {
      setStakeConnection(undefined)
    } else {
      initialize()
    }
  }, [anchorWallet])

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
    const loadCurrentRequest = async () => {
      if (stakeConnection && selectedStakeAccount) {
        const request = await stakeConnection.getSplitRequest(
          selectedStakeAccount
        )

        if (request) {
          setAmount(request.balance)
          setRecipient(request.recipient)
        } else {
          setAmount(undefined)
          setRecipient(undefined)
        }
      }
    }
    loadCurrentRequest()
  }, [selectedStakeAccount])

  useEffect(() => {
    if (stakeAccounts && stakeAccounts.length > 0)
      setSelectStakeAccount(stakeAccounts[0])
  }, [stakeAccounts])

  const approveSplit = async () => {
    if (stakeConnection && selectedStakeAccount && recipient && amount) {
      try {
        await stakeConnection.acceptSplit(
          selectedStakeAccount,
          amount,
          recipient
        )
        toast.success('Successfully created transfer request')
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
              <p className=" p-2 ">
                Request a transfer of locked tokens to a new account
              </p>

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
      <p>{amount != undefined ? `amount: ${amount}` : 'no amount'}</p>
      <p>
        {recipient != undefined ? `recipient: ${recipient}` : 'no recipient'}
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
