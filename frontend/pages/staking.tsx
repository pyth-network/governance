import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { Wallet } from '@project-serum/anchor'
import type { NextPage } from 'next'
import { ChangeEvent, useEffect, useState } from 'react'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { STAKING_PROGRAM } from '@components/constants'
import {
  StakeAccount,
  StakeConnection,
} from '../../staking/app/StakeConnection'
import { getPythTokenBalance } from './api/getPythTokenBalance'
import toast from 'react-hot-toast'
import { Tab } from '@headlessui/react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import { classNames } from 'utils/classNames'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

enum TabEnum {
  Deposit,
  Unlock,
  Withdraw,
}

const tabDescriptions = {
  Deposit:
    'Deposit and lock PYTH. Locking tokens enables you to participate in Pyth Network governance. Newly-locked tokens become eligible to vote in governance at the beginning of the next epoch.',
  Unlock:
    'Unlock PYTH. Unlocking tokens enables you to withdraw them from the program after a cooldown period of two epochs. Unlocked tokens cannot participate in governance.',
  Withdraw:
    'Withdraw PYTH. Transfer any unlocked tokens from the program to your wallet.',
}

const Staking: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { publicKey, connected } = useWallet()
  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccount, setStakeAccount] = useState<StakeAccount>()
  const [balance, setBalance] = useState<number>(0)
  const [pythBalance, setPythBalance] = useState<number>(0)
  const [lockedPythBalance, setLockedPythBalance] = useState<number>(0)
  const [unlockedPythBalance, setUnlockedPythBalance] = useState<number>(0)
  const [unvestedPythBalance, setUnvestedPythBalance] = useState<number>(0)
  const [amount, setAmount] = useState<number>(0)
  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.Deposit)

  // create stake connection when wallet is connected
  useEffect(() => {
    const createStakeConnection = async () => {
      try {
        const sc = await StakeConnection.createStakeConnection(
          connection,
          anchorWallet as Wallet,
          STAKING_PROGRAM
        )
        setStakeConnection(sc)
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
    }
    if (!connected) {
      setStakeConnection(undefined)
      setStakeAccount(undefined)
    } else {
      createStakeConnection()
    }
  }, [connected])

  // update stake account and refresh balances when stake connection is set
  useEffect(() => {
    refreshBalance()
  }, [stakeConnection])

  // set ui balance amount whenever current tab changes
  useEffect(() => {
    if (connected) {
      switch (currentTab) {
        case TabEnum.Deposit:
          setBalance(pythBalance)
          break
        case TabEnum.Unlock:
          setBalance(lockedPythBalance)
          break
        case TabEnum.Withdraw:
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
        toast.error(capitalizeFirstLetter(e.message))
      }
      await refreshBalance()
    }
  }

  // refresh balances each time balances change
  const refreshBalance = async () => {
    if (stakeConnection && publicKey) {
      setPythBalance(await getPythTokenBalance(connection, publicKey))
      const stakeAccounts = await stakeConnection.getStakeAccounts(publicKey)
      if (stakeAccounts.length > 0) {
        setStakeAccount(stakeAccounts[0])
        const { withdrawable, locked, unvested } =
          stakeAccounts[0].getBalanceSummary(await stakeConnection.getTime())
        setLockedPythBalance(locked.toNumber())
        setUnlockedPythBalance(withdrawable.toNumber())
        setUnvestedPythBalance(unvested.toNumber())
      }
    }
  }

  // set current tab value when tab is clicked
  const handleChangeTab = (index: number) => {
    setCurrentTab(index as TabEnum)
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
      <div className="mb-20 flex flex-col items-center px-10">
        <div className="mt-10 w-full max-w-2xl rounded-xl border-2 border-blueGem bg-jaguar px-5 sm:mt-20 sm:px-14 md:px-20">
          <SEO title={'Staking'} />
          <div className="mx-auto mt-5 mb-5 grid w-full grid-cols-3 gap-3 text-center sm:text-left">
            <div className="text-white sm:grid sm:grid-cols-3">
              <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                <img src="/pyth-coin-logo.svg" className="m-auto h-8 sm:h-10" />
              </div>
              <div className="my-auto flex flex-col sm:col-span-2">
                <div className="text-sm font-bold text-white">Locked</div>
                <div className="text-sm text-scampi">{lockedPythBalance}</div>
              </div>
            </div>
            <div className="text-white sm:grid sm:grid-cols-3">
              <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                <img src="/pyth-coin-logo.svg" className="m-auto h-8 sm:h-10" />
              </div>
              <div className="my-auto flex flex-col sm:col-span-2">
                <div className="text-sm font-bold text-white">Unlocked</div>
                <div className="text-sm text-scampi">{unlockedPythBalance}</div>
              </div>
            </div>
            <div className="text-white sm:grid sm:grid-cols-3">
              <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                <img src="/pyth-coin-logo.svg" className="m-auto h-8 sm:h-10" />
              </div>
              <div className="my-auto flex flex-col sm:col-span-2">
                <div className="text-sm font-bold text-white">Unvested</div>
                <div className="text-sm text-scampi">{unvestedPythBalance}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 w-full max-w-2xl rounded-xl border-2 border-blueGem bg-jaguar px-5 sm:px-14 md:px-20">
          <div className="w-full py-8">
            <Tab.Group onChange={handleChangeTab}>
              <Tab.List className="flex justify-center space-x-2">
                {Object.values(TabEnum)
                  .slice(3)
                  .map((v) => (
                    <Tab
                      key={v}
                      className={({ selected }) =>
                        classNames(
                          'py-2.5 px-5 text-xs font-medium sm:text-sm',

                          selected
                            ? 'primary-btn text-white'
                            : 'text-blue-100 hover:bg-white/[0.12] text-scampi hover:text-white'
                        )
                      }
                    >
                      {TabEnum[v as keyof typeof TabEnum]}
                    </Tab>
                  ))}
              </Tab.List>
              <Tab.Panels className="mt-8 sm:mt-12">
                {Object.keys(TabEnum)
                  .slice(3)
                  .map((v, idx) => (
                    <Tab.Panel key={idx}>
                      <div className="col-span-12 font-inter text-xs">
                        <div className="mb-8 text-white sm:mb-12">
                          {tabDescriptions[v as keyof typeof TabEnum]}
                        </div>
                        <div className="mb-2 flex">
                          <div className="ml-auto mr-0 space-x-2 sm:hidden">
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
                        <div className="mb-4 flex items-center justify-between">
                          <label htmlFor="amount" className="block text-white">
                            Amount (PYTH)
                          </label>
                          <div className="ml-auto mr-0 flex items-center space-x-2">
                            <p className="text-white">
                              {currentTab === TabEnum.Deposit
                                ? 'Balance'
                                : currentTab === TabEnum.Unlock
                                ? 'Locked Tokens'
                                : 'Withdrawable'}
                              : {balance}
                            </p>
                            <div className="hidden space-x-2 sm:flex">
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
                        </div>
                        <input
                          type="number"
                          name="amount"
                          id="amount"
                          autoComplete="amount"
                          value={amount}
                          onChange={handleAmountChange}
                          className="input-no-spin mt-1 mb-8 block h-14 w-full rounded-full bg-valhalla px-4 text-lg font-semibold text-white focus:outline-none"
                        />
                        <div className="flex items-center justify-center">
                          {!connected ? (
                            <WalletModalButton
                              className="primary-btn py-3 px-14"
                              text-base
                              font-semibold
                            />
                          ) : currentTab === TabEnum.Deposit ? (
                            <button
                              className="primary-btn py-3 px-14 text-base font-semibold text-white"
                              onClick={handleDeposit}
                            >
                              Deposit
                            </button>
                          ) : currentTab === TabEnum.Unlock ? (
                            <button className="primary-btn py-3 px-14 text-base font-semibold text-white">
                              Unlock
                            </button>
                          ) : (
                            <button className="primary-btn py-3 px-14 text-base font-semibold text-white">
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
