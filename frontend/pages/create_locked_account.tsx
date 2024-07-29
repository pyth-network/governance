import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { getLockSummary, PythBalance, StakeAccount } from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'

const TWELVE_MONTHS = new BN(3600 * 24 * 365)
const NUM_PERIODS = new BN(4)

function formatLockSummary(lock: {
  periodicVesting:
  {
    initialBalance: BN,
    periodDuration: BN,
    startDate: BN,
    numPeriods: BN
  }
}): string[] {
  const lockSummary = getLockSummary(lock, null);
  if (lockSummary.schedule) {
    const rows = lockSummary.schedule.map((x) => {
      return ` - ${x.amount.toString()} on ${new Date(Number(x.date) * 1000).toDateString()}`
    })
    return rows
  }
  else {
    return ['Invalid schedule']
  }
}

const CreateLockedAccount: NextPage = () => {
  const [owner, setOwner] = useState<PublicKey>()
  const [amount, setAmount] = useState<PythBalance>()
  const [startDate, setStartDate] = useState<Date>()
  const [firstUnlock, setFirstUnlock] = useState<Date>()
  const [numPeriods, setNumPeriods] = useState<BN>()
  const [lock, setLock] = useState<{
    periodicVesting:
    {
      initialBalance: BN,
      periodDuration: BN,
      startDate: BN,
      numPeriods: BN
    }
  }>();
  const [hasTested, setHasTested] = useState<boolean>()

  useEffect(() => {
    const loadWalletHasTested = async () => {
      if (stakeConnection && owner) {
        const tested = await stakeConnection.walletHasTested(owner)
        setHasTested(tested)
      }
    }
    loadWalletHasTested()
  }, [owner])

  useEffect(() => {
    if (amount && startDate && firstUnlock && numPeriods) {
      console.log(firstUnlock)
      setLock({
        periodicVesting: {
          initialBalance: amount.toBN(),
          periodDuration: new BN(firstUnlock.getTime() / 1000).sub(new BN(startDate.getTime() / 1000)),
          startDate: new BN(startDate.getTime() / 1000),
          numPeriods
        }
      })
      console.log(lock)
    }
    else {
      setLock(undefined)
    }
  }, [amount, startDate, firstUnlock, numPeriods])

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

  const handleSetDate = (event: any) => {
    try {
      setStartDate(new Date(event.target.value))
    }
    catch (e) {
      setStartDate(undefined)
    }
  }

  const handleSetFirstUnlock = (event: any) => {
    try {
      setFirstUnlock(new Date(event.target.value))
    }
    catch (e) {
      setFirstUnlock(undefined)
    }
  }

  const handleSetNumPeriods = (event: any) => {
    try {
      setNumPeriods(new BN(event.target.value))
    } catch (e) {
      setNumPeriods(undefined)
    }
  }


  const { data: stakeConnection } = useStakeConnection()
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>()

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
      try {
        await stakeConnection.setupVestingAccount(
          amount,
          owner,
          lock,
          false
        )
        toast.success('Successfully created locked account')
      } catch (err) {
        toast.error(capitalizeFirstLetter(err.message))
      }
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
      <p className=" text-sm ">Start date</p>
      <input
        type="date"
        style={{ color: 'black' }}
        onChange={handleSetDate} />
      <p className=" text-sm ">First unlock date</p>
      <input
        type="date"
        style={{ color: 'black' }}
        onChange={handleSetFirstUnlock} />
      <p className=" text-sm ">Number of unlocks</p>
      <input
        type="number"
        style={{ color: 'black' }}
        value={numPeriods ? numPeriods.toString() : ''}
        onChange={handleSetNumPeriods} />
      <p className=" text-sm ">
        Schedule: {lock ? formatLockSummary(lock).map(
          (x) => <p>{x}</p>
        ) : 'Invalid schedule'}
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
            {!hasTested && (
        <a
          className="rounded-full p-2"
          style={{ color: 'red', textDecoration: 'underline' }}
        >
          {' '}
          Warning, this owner hasn't tested
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
