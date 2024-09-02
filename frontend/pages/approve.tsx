import type { NextPage } from 'next'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import { StakeAccount, StakeConnection } from '@pythnetwork/staking'
import { useEffect, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { useSplitRequest } from 'hooks/useSplitRequest'

export async function getStakeAccountsPubkeys(user: PublicKey, stakeConnection : StakeConnection){
  const program = stakeConnection.program;
  const res = await stakeConnection.program.provider.connection.getProgramAccounts(
    program.programId,
    {
      encoding: "base64",
      filters: [
        {
          memcmp: program.coder.accounts.memcmp("positionData"),
        },
        {
          memcmp: {
            offset: 8,
            bytes: user.toBase58(),
          },
        },
      ],
    }
  );

  return res.map((account) => new PublicKey(account.pubkey));
}
const ApproveSplit: NextPage = () => {
  const anchorWallet = useAnchorWallet()

  const [stakeAccounts, setStakeAccounts] = useState<PublicKey[]>()
  const [selectedStakeAccount, setSelectStakeAccount] = useState<StakeAccount>()

  const { data: splitRequest } = useSplitRequest(selectedStakeAccount)
  const { data: stakeConnection } = useStakeConnection()

  const router = useRouter()
  const { owner } = router.query

  const [hasTested, setHasTested] = useState<boolean>(false)

  useEffect(() => {
    const loadWalletHasTested = async () => {
      if (stakeConnection && splitRequest) {
        const tested = await stakeConnection.walletHasTested(
          splitRequest.recipient
        )
        setHasTested(tested)
      }
    }
    loadWalletHasTested()
  }, [splitRequest])

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
    const loadStakeAccounts = async () => {
      if (stakeConnection && anchorWallet && owner) {
        const stakeAccounts = await getStakeAccountsPubkeys(new PublicKey(owner), stakeConnection)
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

  const approveSplit = async () => {
    if (stakeConnection && selectedStakeAccount && splitRequest) {
      try {
        await stakeConnection.acceptSplit(
          selectedStakeAccount,
          splitRequest.balance,
          splitRequest.recipient
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
                  <option key={index} value={option.toBase58()}>
                    {option.toString()}
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
      <p>
        {hasTested
          ? '✅ This recipient is compatible with WalletConnect'
          : '❗This recipient has not tested Wallet Connect, please proceed with caution'}
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
