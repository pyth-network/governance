import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useSplitRequest } from 'hooks/useSplitRequest'
import { getStakeAccountsPubkeys } from './approve'

const RequestSplit: NextPage = () => {
  const [recipient, setRecipient] = useState<PublicKey>()
  const [balance, setBalance] = useState<PythBalance>()

  const handleSetRecipient = (event: any) => {
    try {
      setRecipient(new PublicKey(event.target.value))
    } catch (e) {
      setRecipient(undefined)
    }
  }
  const handleSetAmount = (event: any) => {
    try {
      setBalance(PythBalance.fromString(event.target.value))
    } catch (e) {
      setBalance(undefined)
    }
  }

  const { data: stakeConnection } = useStakeConnection()
  const [stakeAccounts, setStakeAccounts] = useState<PublicKey[]>()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()
  const { data: initialSplitRequest } = useSplitRequest(selectedStakeAccount)

  const [hasTested, setHasTested] = useState<boolean>(false)

  useEffect(() => {
    const loadWalletHasTested = async () => {
      if (stakeConnection && recipient) {
        const tested = await stakeConnection.walletHasTested(recipient)
        setHasTested(tested)
      }
    }
    loadWalletHasTested()
  }, [recipient])

  useEffect(() => {
    const loadStakeAccounts = async () => {
      if (stakeConnection) {
        const stakeAccounts = await getStakeAccountsPubkeys(stakeConnection.userPublicKey(), stakeConnection)
        setStakeAccounts(stakeAccounts)
        if (stakeAccounts.length > 0){
          setSelectStakeAccount(await stakeConnection.loadStakeAccount(stakeAccounts[0]))
        } else {
          setSelectStakeAccount(undefined)
        }
      } else {
        setStakeAccounts(undefined)
      }
    }
    loadStakeAccounts()
  }, [stakeConnection])

  const handleSelectStakeAccount = (event: any) => {
    const loadStakeAccount = async () => {
    if (stakeAccounts && stakeConnection){
      const stakeAccount = stakeAccounts.find(s => s.toString() === event.target.value)
      if (stakeAccount) {
        setSelectStakeAccount(await stakeConnection.loadStakeAccount(stakeAccount))
      }
    }
    }
    loadStakeAccount()
  }

  useEffect(() => {
    if (initialSplitRequest) {
      setRecipient(initialSplitRequest.recipient)
      setBalance(initialSplitRequest.balance)
    } else {
      setRecipient(undefined)
      setBalance(undefined)
    }
  }, [initialSplitRequest])

  const requestSplit = async () => {
    if (stakeConnection && selectedStakeAccount && recipient && balance)
      try {
        await stakeConnection.requestSplit(
          selectedStakeAccount,
          balance,
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
                <option key={index} value={option.toBase58()}>
                  {option.toString()}
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
            <p>
              {hasTested
                ? '✅ This recipient is compatible with WalletConnect'
                : '❗This recipient has not tested Wallet Connect, please proceed with caution'}
            </p>
            <p className=" text-sm ">Amount</p>
            <input
              type="text"
              style={{ color: 'black' }}
              value={balance ? balance.toString() : ''}
              onChange={handleSetAmount}
            />
            <p className=" text-sm ">
              Recipient :{' '}
              {recipient ? recipient.toString() : 'Invalid recipient'}
            </p>
            <p className=" text-sm ">
              Amount to be transferred:{' '}
              {balance ? balance.toString() : 'Invalid amount to transfer'}
            </p>
          </div>
        )}

      {stakeConnection && recipient && balance ? (
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
