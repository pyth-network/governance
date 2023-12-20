import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import {
  PythBalance,
  StakeAccount,
  StakeConnection,
  STAKING_ADDRESS,
} from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { Wallet } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

const RequestSplit: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()

  const [recipient, setRecipient] = useState<PublicKey>()
  const [amount, setAmount] = useState<PythBalance>()

  const handleSetRecipient = (event: any) => {
    try {
      setRecipient(new PublicKey(event.target.value))
    } catch (e) {
      setRecipient(undefined)
    }
  }
  const handleSetAmount = (event: any) => {
    try {
      setAmount(PythBalance.fromString(event.target.value))
    } catch (e) {
      setAmount(undefined)
    }
  }

  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()

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
          anchorWallet.publicKey
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
        }
      }
      loadCurrentRequest()
    }
  }, [selectedStakeAccount])

  useEffect(() => {
    if (stakeAccounts && stakeAccounts.length > 0)
      setSelectStakeAccount(stakeAccounts[0])
  }, [stakeAccounts])

  const requestSplit = async () => {
    if (stakeConnection && selectedStakeAccount && recipient && amount)
      try {
        await stakeConnection.requestSplit(
          selectedStakeAccount,
          amount,
          recipient
        )
        toast.success('Successfully created transfer request')
      } catch (err) {
        toast.error(capitalizeFirstLetter(err.message))
      }
  }

  return (
    <Layout>
      <SEO title={'Request split'} />

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
              {stakeAccounts!.map((option, index) => (
                <option key={index} value={option.address.toBase58()}>
                  {option.address.toString()}
                </option>
              ))}
            </select>
            {selectedStakeAccount && (
              <p>
                This account has{' '}
                {new PythBalance(selectedStakeAccount!.tokenBalance).toString()}{' '}
                tokens
              </p>
            )}

            <p className=" text-sm ">Recipient</p>
            <input
              type="text"
              style={{ color: 'black' }}
              value={recipient ? recipient.toString() : ''}
              onChange={handleSetRecipient}
            />
            <p className=" text-sm ">Amount</p>
            <input
              type="text"
              style={{ color: 'black' }}
              value={amount ? amount.toString() : ''}
              onChange={handleSetAmount}
            />
            <p className=" text-sm ">
              Recipient :{' '}
              {recipient ? recipient.toString() : 'Invalid recipient'}
            </p>
            <p className=" text-sm ">
              Amount to be transferred:{' '}
              {amount ? amount.toString() : 'Invalid amount to transfer'}
            </p>
          </div>
        )}

      {stakeConnection && recipient && amount ? (
        <p>
          <button
            className="rounded-full p-2 hover:bg-hoverGray"
            onClick={() => requestSplit()}
          >
            Click to approve
          </button>
        </p>
      ) : !stakeConnection ? (
        <p className="p-2 hover:bg-hoverGray"> Please connect wallet</p>
      ) : !recipient ? (
        <p className="p-2 hover:bg-hoverGray ">Please insert valid recipient</p>
      ) : (
        <p className="p-2 hover:bg-hoverGray ">
          Please insert valid amount to be transferred
        </p>
      )}
    </Layout>
  )
}

export default RequestSplit
