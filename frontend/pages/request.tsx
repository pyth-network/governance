import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { PythBalance, StakeAccount } from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useStakeAccounts } from 'hooks/useStakeAccounts'
import { useSplitRequest } from 'hooks/useSplitRequest'

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
  const { data: stakeAccounts } = useStakeAccounts()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()
  const { data: initialSplitRequest } = useSplitRequest(selectedStakeAccount)

  const handleSelectStakeAccount = (event: any) => {
    for (const stakeAccount of stakeAccounts!) {
      if (stakeAccount.address.toString() === event.target.value) {
        setSelectStakeAccount(stakeAccount)
        break
      }
    }
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

  useEffect(() => {
    if (stakeAccounts && stakeAccounts.length > 0)
      setSelectStakeAccount(stakeAccounts[0])
  }, [stakeAccounts])

  const requestSplit = async () => {
    if (stakeConnection && selectedStakeAccount && recipient && balance)
      try {
        console.log('requesting split')
        const preInstructions = [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 20000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 30101 }),
        ]
        await stakeConnection.program.methods
          .requestSplit(balance.toBN(), recipient)
          // .preInstructions(preInstructions)
          .accounts({
            stakeAccountPositions: selectedStakeAccount.address,
          })
          .rpc()
        toast.success('Successfully created transfer request')
      } catch (err) {
        console.log(err)
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
