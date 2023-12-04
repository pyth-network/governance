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
import { BN, Wallet } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

const TWELVE_MONTHS = new BN(3600 * 24 * 365)
const NUM_PERIODS = new BN(4)

const CreateLockedAccount: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()

  const [owner, setOwner] = useState<PublicKey>()
  const [amount, setAmount] = useState<PythBalance>()

  const handleSetOwner = (event: any) => {
    try {
      setOwner(new PublicKey(event.target.value))
    } catch (e) {
      setOwner(undefined)
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
      if (stakeConnection && owner) {
        const stakeAccounts = await stakeConnection.getStakeAccounts(owner)
        setStakeAccounts(stakeAccounts)
      } else {
        setStakeAccounts(undefined)
      }
    }
    loadStakeAccounts()
  }, [owner, stakeConnection])

  const createLockedAccount = async () => {
    if (stakeConnection && owner && amount)
      await stakeConnection.setupVestingAccount(
        amount,
        owner,
        {
          periodicVestingAfterListing: {
            initialBalance: amount.toBN(),
            periodDuration: TWELVE_MONTHS,
            numPeriods: NUM_PERIODS,
          },
        },
        false
      )
  }

  return (
    <Layout>
      <SEO title={'Create Locked Account'} />
      <p className=" p-2 ">
        Create a locked account with the standard unlock schedule
      </p>
      <p className=" text-sm ">Owner</p>
      <input
        type="text"
        style={{ color: 'black' }}
        value={owner ? owner.toString() : ''}
        onChange={handleSetOwner}
      />
      <p className=" text-sm ">Amount</p>
      <input
        type="text"
        style={{ color: 'black' }}
        value={amount ? amount.toString() : ''}
        onChange={handleSetAmount}
      />
      <p className=" text-sm ">
        Owner : {owner ? owner.toString() : 'Invalid owner'}
      </p>
      <p className=" text-sm ">
        Amount : {amount ? amount.toString() : 'Invalid amount'}
      </p>
      {stakeAccounts && stakeAccounts.length > 0 && (
        <a
          className="rounded-full p-2"
          href={`/api/v1/locked_accounts?owner=${owner?.toString()}`}
          style={{ color: 'red', textDecoration: 'underline' }}
        >
          {' '}
          Warning, this account already has a locked account
        </a>
      )}
      {stakeConnection && owner && amount ? (
        <p>
          <button
            className="rounded-full p-2 hover:bg-hoverGray"
            onClick={() => createLockedAccount()}
          >
            Click to approve
          </button>
        </p>
      ) : !stakeConnection ? (
        <p className="p-2 hover:bg-hoverGray"> Please connect wallet</p>
      ) : !owner ? (
        <p className="p-2 hover:bg-hoverGray ">Please insert valid owner</p>
      ) : (
        <p className="p-2 hover:bg-hoverGray ">Please insert valid amount</p>
      )}
    </Layout>
  )
}

export default CreateLockedAccount
