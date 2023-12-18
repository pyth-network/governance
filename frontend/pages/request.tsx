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
import { utils, Wallet } from '@coral-xyz/anchor'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from '../utils/capitalizeFirstLetter'
import { PublicKey } from '@solana/web3.js'
import { useRouter } from 'next/router'

const ApproveSplit: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { connected } = useWallet()

  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()

  const [stakeAccount, setStakeAccount] = useState<StakeAccount>()
  const [amount, setAmount] = useState<PythBalance>()
  const [recipient, setRecipient] = useState<PublicKey>()

  useEffect(() => {
    const initialize = async () => {
      try {
        const stakeConnection = await StakeConnection.createStakeConnection(
          connection,
          anchorWallet as Wallet,
          STAKING_ADDRESS
        )
        setStakeConnection(stakeConnection)
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
    }
    if (!connected) {
      setStakeConnection(undefined)
    } else {
      initialize()
    }
  }, [connected])

  const router = useRouter()
  const { key } = router.query

  useEffect(() => {
    const helper = async () => {
      if (stakeConnection !== undefined) {
        const splitAccountOwner: PublicKey = new PublicKey(key!)
        const stakeAccount = (await stakeConnection!.getMainAccount(
          splitAccountOwner
        ))!

        const { balance, recipient } = (await stakeConnection.getSplitRequest(
          stakeAccount
        ))!

        setStakeAccount(stakeAccount)
        setAmount(balance)
        setRecipient(recipient)
      }
    }
    helper()
  }, [stakeConnection])

  const approveSplit = async () => {
    await stakeConnection!.acceptSplit(stakeAccount!, amount!, recipient!)
  }

  return (
    <Layout>
      <SEO title={'Request Split'} />
      <p className=" text-sm ">Request a transfer of locked tokens {key}</p>
      <p>
        {stakeAccount != undefined
          ? `stake account address: ${stakeAccount.address}`
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
