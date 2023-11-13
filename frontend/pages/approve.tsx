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
  StakeConnection,
  STAKING_ADDRESS,
} from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { utils, Wallet } from '@project-serum/anchor'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from '../utils/capitalizeFirstLetter'
import { PublicKey } from '@solana/web3.js'
import { wasm } from '@pythnetwork/staking/app/StakeConnection'
import { useRouter } from 'next/router'

const ApproveSplit: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { publicKey, connected } = useWallet()

  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()

  const [splitAccountOwner, setSplitAccountOwner] = useState<PublicKey>()
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

        const splitRequestAccount = PublicKey.findProgramAddressSync(
          [
            utils.bytes.utf8.encode('split_request'),
            stakeAccount.address.toBuffer(),
          ],
          stakeConnection!.program.programId
        )[0]
        const splitRequest =
          await stakeConnection!.program.account.splitRequest.fetch(
            splitRequestAccount
          )

        setSplitAccountOwner(splitAccountOwner)
        setAmount(new PythBalance(splitRequest.amount))
        setRecipient(splitRequest.recipient)
      }
    }
    helper()
  }, [stakeConnection])

  const approveSplit = async () => {
    console.log(amount)
    console.log(recipient)
    const stakeAccount = (await stakeConnection!.getMainAccount(
      splitAccountOwner!
    ))!
    await stakeConnection!.acceptSplit(stakeAccount, amount!, recipient!)
  }

  return (
    <Layout>
      <SEO title={'Approve Split'} />
      <p className=" text-sm ">Approve a split to {key}</p>
      <p>
        {splitAccountOwner != undefined
          ? `account owner: ${splitAccountOwner}`
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
        this is a button
      </button>
    </Layout>
  )
}

export default ApproveSplit
