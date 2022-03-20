import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { Wallet, Provider } from '@project-serum/anchor'
import type { NextPage } from 'next'
import { ChangeEvent, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { STAKING_PROGRAM } from '@components/constants'
import {
  StakeAccount,
  StakeConnection,
} from '../../staking-ts/src/StakeConnection'
import { getPythTokenBalance } from './api/getPythTokenBalance'
import { airdropPythToken } from './api/airdropPythToken'
import { getLockedPythTokenBalance } from './api/getLockedPythTokenBalance'
import { getUnlockedPythTokenBalance } from './api/getUnlockedPythTokenBalance'
import toast from 'react-hot-toast'
import { Tab } from '@headlessui/react'
import {
  WalletConnectButton,
  WalletModalButton,
} from '@solana/wallet-adapter-react-ui'

const classNames = (...classes: any) => {
  return classes.filter(Boolean).join(' ')
}

const Staking: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { publicKey, connected, connecting } = useWallet()
  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccount, setStakeAccount] = useState<StakeAccount>()
  const [balance, setBalance] = useState<number>(0)
  const [pythBalance, setPythBalance] = useState<number>(0)
  const [lockedPythBalance, setLockedPythBalance] = useState<number>(0)
  const [unlockedPythBalance, setUnlockedPythBalance] = useState<number>(0)
  const [unvestedPythBalance, setUnvestedPythBalance] = useState<number>(0)
  const [amount, setAmount] = useState<number>(0)
  const [currentTab, setCurrentTab] = useState<string>('Deposit')

  const tabValues = ['Deposit', 'Unlock', 'Withdraw']

  // create stake connection when wallet is connected
  useEffect(() => {
    const createStakeConnection = async () => {
      const sc = await StakeConnection.createStakeConnection(
        connection,
        anchorWallet as Wallet,
        STAKING_PROGRAM
      )
      setStakeConnection(sc)
    }
    if (!connected) {
      setStakeConnection(undefined)
      setStakeAccount(undefined)
    } else {
      createStakeConnection()
    }
  }, [connected])

  // get stake accounts when stake connection is set
  useEffect(() => {
    if (stakeConnection && publicKey) {
      stakeConnection
        ?.getStakeAccounts(publicKey)
        .then((sa) => {
          if (sa.length > 0) {
            setStakeAccount(sa[0])
            setLockedPythBalance(sa[0].token_balance.toString())
          }
        })
        .then(() => {
          refreshBalance()
        })
    }
  }, [stakeConnection])

  // set ui balance amount whenever current tab changes
  useEffect(() => {
    if (connected) {
      switch (currentTab) {
        case 'Deposit':
          setBalance(pythBalance)
          break
        case 'Unlock':
          setBalance(lockedPythBalance)
          break
        case 'Withdraw':
          setBalance(unlockedPythBalance)
          break
      }
    } else {
      setBalance(0)
    }
  }, [
    currentTab,
    connected,
    pythBalance,
    lockedPythBalance,
    unlockedPythBalance,
  ])

  // set amount when input changes
  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(parseFloat(event.target.value))
  }

  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const handleDeposit = async () => {
    if (stakeConnection && publicKey) {
      try {
        await stakeConnection.depositAndLockTokens(stakeAccount, amount)
        toast.success('Deposit successful!')
      } catch (e) {
        toast.error(e.message)
      }
      await refreshBalance()
    }
  }

  // airdrop pyth token to user if they have no pyth token
  const handleClaimPyth = async () => {
    if (publicKey) {
      const provider = new Provider(connection, anchorWallet as Wallet, {})
      try {
        await airdropPythToken(provider, publicKey)
        toast.success('Airdrop successful!')
      } catch (e) {
        toast.error(e.message)
      }
    }
    await refreshBalance()
  }

  // refresh balance each time balances change
  const refreshBalance = async () => {
    if (stakeConnection && publicKey) {
      setPythBalance(await getPythTokenBalance(connection, publicKey))
      setLockedPythBalance(
        await getLockedPythTokenBalance(stakeConnection, publicKey)
      )
      setUnlockedPythBalance(
        await getUnlockedPythTokenBalance(stakeConnection, publicKey)
      )
    }
  }

  // set current tab value when tab is clicked
  const handleChangeTab = (index: number) => {
    setCurrentTab(tabValues[index])
  }

  // set input amount to half of pyth balance in wallet
  const handleHalfBalanceClick = () => {
    setAmount(balance / 2)
  }

    // set input amount to max of pyth balance in wallet
  const handleMaxBalanceClick = () => {
    setAmount(balance)
  }

  return (
    <Layout>
      <SEO title={'Staking'} />
      <div className="flex flex-col items-center justify-center">
        <div className="mt-20 mb-20 max-w-2xl rounded-xl border-2 border-blueGem bg-jaguar px-20">
          <div className="w-full max-w-lg py-8">
            <Tab.Group onChange={handleChangeTab}>
              <Tab.List className="mx-24 space-x-2">
                {tabValues.map((v) => (
                  <Tab
                    key={v}
                    className={({ selected }) =>
                      classNames(
                        'py-2.5 px-5 text-sm font-medium text-scampi',

                        selected
                          ? 'primary-btn text-white'
                          : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                      )
                    }
                  >
                    {v}
                  </Tab>
                ))}
              </Tab.List>
              <Tab.Panels className="mt-16">
                {tabValues.map((v, idx) => (
                  <Tab.Panel key={idx}>
                    <div className="col-span-12 font-inter text-xs">
                      <div className="mb-4 flex items-center justify-between">
                        <label htmlFor="amount" className="block text-white">
                          Amount (PYTH)
                        </label>
                        <div className="ml-auto mr-0 flex items-center space-x-2">
                          <p className="text-white">
                            {currentTab === 'Deposit'
                              ? 'Balance'
                              : currentTab === 'Unlock'
                              ? 'Locked Tokens'
                              : 'Withdrawable'}
                            : {balance}
                          </p>
                          <button
                            className="outlined-btn"
                            onClick={handleHalfBalanceClick}
                          >
                            Half
                          </button>
                          <button
                            className="outlined-btn"
                            onClick={handleMaxBalanceClick}
                          >
                            Max
                          </button>
                        </div>
                      </div>
                      <input
                        type="number"
                        name="amount"
                        id="amount"
                        autoComplete="amount"
                        value={amount}
                        onChange={handleAmountChange}
                        className=" input-no-spin mt-1 mb-8 block h-14 w-full rounded-full bg-valhalla px-4 text-lg font-semibold text-white focus:outline-none"
                      />
                      <div className="flex items-center justify-center">
                        {!connected ? (
                          <WalletModalButton
                            className="primary-btn py-3 px-14"
                            text-base
                            font-semibold
                          />
                        ) : pythBalance === 0 ? (
                          <button
                            className="primary-btn py-3 px-14 text-base font-semibold text-white"
                            onClick={handleClaimPyth}
                          >
                            Claim $PYTH
                          </button>
                        ) : currentTab === 'Deposit' ? (
                          <button
                            className="primary-btn py-4 px-14 text-base font-semibold text-white"
                            onClick={handleDeposit}
                          >
                            Deposit
                          </button>
                        ) : currentTab === 'Unlock' ? (
                          <button className="primary-btn py-4 px-14 text-base font-semibold text-white">
                            Unlock
                          </button>
                        ) : (
                          <button className="primary-btn py-4 px-14 text-base font-semibold text-white">
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </Tab.Group>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Staking
