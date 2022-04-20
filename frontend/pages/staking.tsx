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
import { PythBalance, StakeAccount, StakeConnection } from 'pyth-staking-api'
import { getPythTokenBalance } from './api/getPythTokenBalance'
import toast from 'react-hot-toast'
import { Tab } from '@headlessui/react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import { classNames } from 'utils/classNames'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import BN from 'bn.js'
import Tooltip from '@components/Tooltip'

enum TabEnum {
  Lock,
  Unlock,
  Withdraw,
}

const tabDescriptions = {
  Lock: 'Deposit and lock PYTH. Locking tokens enables you to participate in Pyth Network governance. Newly-locked tokens become eligible to vote in governance at the beginning of the next epoch.',
  Unlock:
    'Unlock PYTH. Unlocking tokens enables you to withdraw them from the program after a cooldown period of two epochs. Unlocked tokens cannot participate in governance.',
  Withdraw:
    'Withdraw PYTH. Transfer any unlocked tokens from the program to your wallet.',
}

const Staking: NextPage = () => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()
  const { publicKey, connected } = useWallet()
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false)
  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccount, setStakeAccount] = useState<StakeAccount>()
  const [balance, setBalance] = useState<PythBalance>()
  const [pythBalance, setPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [lockedPythBalance, setLockedPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [unlockedPythBalance, setUnlockedPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [unvestedPythBalance, setUnvestedPythBalance] = useState<PythBalance>(
    new PythBalance(new BN(0))
  )
  const [lockingPythBalance, setLockingPythBalance] = useState<PythBalance>()
  const [unlockingPythBalance, setUnlockingPythBalance] =
    useState<PythBalance>()
  const [amount, setAmount] = useState<string>('')
  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.Lock)

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
        case TabEnum.Lock:
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
      setBalance(undefined)
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
    const re = /^(\d*\.)?\d{0,6}$/
    if (re.test(event.target.value)) {
      setAmount(event.target.value)
    }
  }

  // call deposit and lock api when deposit button is clicked (create stake account if not already created)
  const handleDeposit = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const depositAmount = PythBalance.fromString(amount)
    if (depositAmount.toBN().gt(new BN(0))) {
      try {
        await stakeConnection?.depositAndLockTokens(stakeAccount, depositAmount)
        toast.success(`Deposit and locked ${amount} PYTH tokens!`)
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
      await refreshBalance()
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  // call unlock api when unlock button is clicked
  const handleUnlock = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const unlockAmount = PythBalance.fromString(amount)
    if (unlockAmount.toBN().gt(new BN(0))) {
      if (stakeAccount) {
        try {
          await stakeConnection?.unlockTokens(stakeAccount, unlockAmount)
          toast.success('Unlock successful!')
        } catch (e) {
          toast.error(capitalizeFirstLetter(e.message))
        }
        await refreshBalance()
      } else {
        toast.error('Stake account is undefined.')
      }
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  // withdraw unlocked PYTH tokens to wallet
  const handleWithdraw = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const withdrawAmount = PythBalance.fromString(amount)
    if (withdrawAmount.toBN().gt(new BN(0))) {
      if (stakeAccount) {
        try {
          await stakeConnection?.withdrawTokens(stakeAccount, withdrawAmount)
          toast.success('Withdraw successful!')
        } catch (e) {
          toast.error(capitalizeFirstLetter(e.message))
        }
        await refreshBalance()
      } else {
        toast.error('Stake account is undefined.')
      }
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  // refresh balances each time balances change
  const refreshBalance = async () => {
    setIsBalanceLoading(true)
    if (stakeConnection && publicKey) {
      setPythBalance(await getPythTokenBalance(connection, publicKey))
      const stakeAccount = await stakeConnection.getMainAccount(publicKey)
      if (stakeAccount) {
        setStakeAccount(stakeAccount)
        const { withdrawable, locked, unvested } =
        stakeAccount.getBalanceSummary(await stakeConnection.getTime())
        setLockingPythBalance(locked.locking)
        setLockedPythBalance(locked.locked)
        setUnlockingPythBalance(new PythBalance(locked.unlocking.toBN().add(locked.preunlocking.toBN())))

        setUnlockedPythBalance(withdrawable)
        setUnvestedPythBalance(unvested)
      }
    }
    setIsBalanceLoading(false)
  }

  // set current tab value when tab is clicked
  const handleChangeTab = (index: number) => {
    setCurrentTab(index as TabEnum)
  }

  // set input amount to half of pyth balance in wallet
  const handleHalfBalanceClick = () => {
    if (balance) {
      setAmount(new PythBalance(balance.toBN().div(new BN(2))).toString())
    }
  }

  // set input amount to max of pyth balance in wallet
  const handleMaxBalanceClick = () => {
    if (balance) {
      setAmount(balance.toString())
    }
  }

  return (
    <Layout>
      <SEO title={'Staking'} />
      <div className="mb-20 flex flex-col items-center px-8">
        <div className="mt-2 w-full max-w-2xl rounded-xl border-2 border-blueGem bg-jaguar px-5 sm:mt-12 sm:px-14">
          <SEO title={'Staking'} />
          <div className="mx-auto mt-5 mb-5 grid w-full grid-cols-3 gap-3 text-center sm:text-left">
            <div className="text-white sm:grid sm:grid-cols-3">
              <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                <img src="/pyth-coin-logo.svg" className="m-auto h-8 sm:h-10" />
              </div>
              <div className="my-auto flex flex-col sm:col-span-2">
                <div className="mx-auto flex text-sm font-bold sm:m-0">
                  Locked{' '}
                </div>
                {isBalanceLoading ? (
                  <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-ebonyClay sm:m-0" />
                ) : (
                  <div className="mx-auto justify-center text-sm sm:m-0 sm:justify-start">
                    {lockedPythBalance?.toString()}{' '}
                    {lockingPythBalance &&
                    lockingPythBalance.toString() !== '0' ? (
                      <div>
                        <Tooltip content="These tokens will be locked from the beginning of the next epoch.">
                          <div className="mx-1 text-scampi">
                            (+{lockingPythBalance.toString()})
                          </div>
                        </Tooltip>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div className="text-white sm:grid sm:grid-cols-3">
              <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                <img src="/pyth-coin-logo.svg" className="m-auto h-8 sm:h-10" />
              </div>
              <div className="my-auto flex flex-col sm:col-span-2">
                <div className="mx-auto flex text-sm font-bold sm:m-0">
                  Unlocked{' '}
                </div>
                {isBalanceLoading ? (
                  <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-ebonyClay sm:m-0" />
                ) : (
                  <div className="mx-auto justify-center text-sm sm:m-0 sm:justify-start">
                    {unlockedPythBalance?.toString()}{' '}
                    {unlockingPythBalance &&
                    unlockingPythBalance.toString() !== '0' ? (
                      <div>
                        <Tooltip content="These tokens have to go through a cool-down period for 2 epochs before they can be withdrawn.">
                          <div className="text-scampi">
                            (+{unlockingPythBalance.toString()})
                          </div>
                        </Tooltip>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div className="text-white sm:grid sm:grid-cols-3">
              <div className="mb-2 flex content-center sm:mr-2 sm:mb-0">
                <img src="/pyth-coin-logo.svg" className="m-auto h-8 sm:h-10" />
              </div>
              <div className="my-auto flex flex-col sm:col-span-2">
                <div className="text-sm font-bold">Unvested</div>
                {isBalanceLoading ? (
                  <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-ebonyClay sm:m-0" />
                ) : (
                  <div className="text-sm">
                    {unvestedPythBalance?.toString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 w-full max-w-2xl rounded-xl border-2 border-blueGem bg-jaguar px-5 sm:px-14">
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
              <Tab.Panels className="mt-4 sm:mt-12">
                {Object.keys(TabEnum)
                  .slice(3)
                  .map((v, idx) => (
                    <Tab.Panel key={idx}>
                      <div className="col-span-12 font-inter text-xs">
                        <div className="mb-4 h-16 text-white sm:mb-12 sm:h-12">
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
                            {isBalanceLoading ? (
                              <div className="h-5 w-14 animate-pulse rounded-lg bg-ebonyClay" />
                            ) : (
                              <p className="text-white">
                                {currentTab === TabEnum.Lock
                                  ? 'Balance'
                                  : currentTab === TabEnum.Unlock
                                  ? 'Locked Tokens'
                                  : 'Withdrawable'}
                                : {balance?.toString()}
                              </p>
                            )}
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
                          type="text"
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
                          ) : currentTab === TabEnum.Lock ? (
                            <button
                              className="primary-btn py-3 px-14 text-base font-semibold text-white"
                              onClick={handleDeposit}
                            >
                              Lock
                            </button>
                          ) : currentTab === TabEnum.Unlock ? (
                            <button
                              className="primary-btn py-3 px-14 text-base font-semibold text-white"
                              onClick={handleUnlock}
                            >
                              Unlock
                            </button>
                          ) : (
                            <button
                              className="primary-btn py-3 px-14 text-base font-semibold text-white"
                              onClick={handleWithdraw}
                            >
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
