import CloseIcon from '@components/icons/CloseIcon'
import Tooltip from '@components/Tooltip'
import { Dialog, Listbox, Tab, Transition } from '@headlessui/react'
import { CheckIcon, SelectorIcon } from '@heroicons/react/solid'
import { Wallet } from '@project-serum/anchor'
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react'
import { WalletModalButton } from '@solana/wallet-adapter-react-ui'
import BN from 'bn.js'
import type { NextPage } from 'next'
import {
  PythBalance,
  StakeAccount,
  StakeConnection,
  STAKING_ADDRESS,
  VestingAccountState,
} from 'pyth-staking-api'
import { ChangeEvent, Fragment, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'
import { classNames } from 'utils/classNames'
import Layout from '../components/Layout'
import SEO from '../components/SEO'
import { getPythTokenBalance } from './api/getPythTokenBalance'

import LockedIcon from '@components/icons/LockedIcon'
import UnlockedIcon from '@components/icons/UnlockedIcon'
import UnvestedIcon from '@components/icons/UnvestedIcon'
import Spinner from '@components/Spinner'

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
  const [
    isMultipleStakeAccountsModalOpen,
    setIsMultipleStakeAccountsModalOpen,
  ] = useState<boolean>(false)
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false)
  const [isLockedModalOpen, setIsLockedModalOpen] = useState<boolean>(false)
  const [isUnlockedModalOpen, setIsUnlockedModalOpen] = useState<boolean>(false)
  const [isUnvestedModalOpen, setIsUnvestedModalOpen] = useState<boolean>(false)
  const [isLockButtonDisabled, setIsLockButtonDisabled] =
    useState<boolean>(false)
  const [
    multipleStakeAccountsModalOption,
    setMultipleStakeAccountsModalOption,
  ] = useState<StakeAccount>()
  const [isBalanceLoading, setIsBalanceLoading] = useState<boolean>(false)
  const [isSufficientBalance, setIsSufficientBalance] = useState<boolean>(true)
  const [stakeConnection, setStakeConnection] = useState<StakeConnection>()
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>([])
  const [mainStakeAccount, setMainStakeAccount] = useState<StakeAccount>()
  const [balance, setBalance] = useState<PythBalance>()
  const [pythBalance, setPythBalance] = useState<PythBalance>(
    PythBalance.zero()
  )
  const [lockedPythBalance, setLockedPythBalance] = useState<PythBalance>(
    PythBalance.zero()
  )
  const [unlockedPythBalance, setUnlockedPythBalance] = useState<PythBalance>(
    PythBalance.zero()
  )
  const [unvestedTotalPythBalance, setUnvestedTotalPythBalance] =
    useState<PythBalance>(PythBalance.zero())
  const [unvestedLockingPythBalance, setUnvestedLockingPythBalance] =
    useState<PythBalance>(PythBalance.zero())
  const [unvestedLockedPythBalance, setUnvestedLockedPythBalance] =
    useState<PythBalance>(PythBalance.zero())
  const [unvestedPreUnlockingPythBalance, setUnvestedPreUnlockingPythBalance] =
    useState<PythBalance>(PythBalance.zero())
  const [unvestedUnlockingPythBalance, setUnvestedUnlockingPythBalance] =
    useState<PythBalance>(PythBalance.zero())
  const [unvestedUnlockedPythBalance, setUnvestedUnlockedPythBalance] =
    useState<PythBalance>(PythBalance.zero())
  const [lockingPythBalance, setLockingPythBalance] = useState<PythBalance>()
  const [unlockingPythBalance, setUnlockingPythBalance] =
    useState<PythBalance>()
  const [amount, setAmount] = useState<string>('')
  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.Lock)
  const [nextVestingAmount, setNextVestingAmount] = useState<PythBalance>(
    PythBalance.zero()
  )
  const [nextVestingDate, setNextVestingDate] = useState<Date>()
  const [currentVestingAccountState, setCurrentVestingAccountState] =
    useState<VestingAccountState>()

  // create stake connection and get stake accounts when wallet is connected
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsBalanceLoading(true)
        const stakeConnection = await StakeConnection.createStakeConnection(
          connection,
          anchorWallet as Wallet,
          STAKING_ADDRESS
        )
        setStakeConnection(stakeConnection)
        const stakeAccounts = await stakeConnection.getStakeAccounts(
          (anchorWallet as Wallet).publicKey
        )
        setStakeAccounts(stakeAccounts)
        if (stakeAccounts.length === 1) {
          setMainStakeAccount(stakeAccounts[0])
        } else if (stakeAccounts.length > 1) {
          setIsMultipleStakeAccountsModalOpen(true)
          setMultipleStakeAccountsModalOption(stakeAccounts[0])
        } else {
          setIsBalanceLoading(false)
        }
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
    }
    if (!connected) {
      setStakeConnection(undefined)
      setMainStakeAccount(undefined)
      resetBalance()
    } else {
      initialize()
    }
  }, [connected])

  // check if vesting account without governance exists and refresh balances after getting stake accounts
  useEffect(() => {
    refreshVestingAccountState()
    refreshBalance()
  }, [stakeConnection, mainStakeAccount])

  useEffect(() => {
    if (amount && balance) {
      if (PythBalance.fromString(amount).gt(balance)) {
        setIsSufficientBalance(false)
      } else {
        setIsSufficientBalance(true)
      }
    } else {
      setIsSufficientBalance(true)
    }
  }, [amount])

  useEffect(() => {
    const getVestingInfo = async () => {
      if (stakeConnection && mainStakeAccount) {
        const currentTime = await stakeConnection.getTime()
        const nextVestingEvent = mainStakeAccount.getNextVesting(currentTime)
        if (nextVestingEvent) {
          setNextVestingAmount(
            new PythBalance(new BN(nextVestingEvent.amount.toString()))
          )
          setNextVestingDate(new Date(Number(nextVestingEvent.time) * 1000))
        }
      }
    }
    getVestingInfo()
  }, [unvestedTotalPythBalance])

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

  const resetBalance = () => {
    setPythBalance(PythBalance.zero())
    setLockingPythBalance(PythBalance.zero())
    setLockedPythBalance(PythBalance.zero())
    setUnlockingPythBalance(PythBalance.zero())
    setUnvestedTotalPythBalance(PythBalance.zero())
    setUnvestedLockingPythBalance(PythBalance.zero())
    setUnvestedLockedPythBalance(PythBalance.zero())
    setUnvestedPreUnlockingPythBalance(PythBalance.zero())
    setUnvestedUnlockingPythBalance(PythBalance.zero())
    setUnvestedUnlockedPythBalance(PythBalance.zero())
    setUnlockedPythBalance(PythBalance.zero())
    setNextVestingAmount(PythBalance.zero())
  }

  const refreshVestingAccountState = async () => {
    if (stakeConnection && mainStakeAccount) {
      const currentTime = await stakeConnection.getTime()
      const vestingAccountState =
        mainStakeAccount.getVestingAccountState(currentTime)
      setCurrentVestingAccountState(vestingAccountState)
      setIsLockButtonDisabled(
        vestingAccountState != VestingAccountState.FullyVested &&
          vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked
      )
    }
  }

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
    if (depositAmount.gt(PythBalance.zero())) {
      setIsActionLoading(true)
      try {
        await stakeConnection?.depositAndLockTokens(
          mainStakeAccount,
          depositAmount
        )
        toast.success(`Deposit and locked ${amount} PYTH tokens!`)
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
      setIsActionLoading(false)
      await refreshStakeAccount()
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  const handleCloseMultipleStakeAccountsModal = () => {
    setIsMultipleStakeAccountsModalOpen(false)
  }

  // call unlock api when unlock button is clicked
  const handleUnlock = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const unlockAmount = PythBalance.fromString(amount)
    if (unlockAmount.gt(PythBalance.zero())) {
      if (mainStakeAccount) {
        setIsActionLoading(true)
        try {
          await stakeConnection?.unlockTokens(mainStakeAccount, unlockAmount)
          toast.success('Unlock successful!')
        } catch (e) {
          toast.error(capitalizeFirstLetter(e.message))
        }
        setIsActionLoading(false)
        await refreshStakeAccount()
      } else {
        toast.error('Stake account is undefined.')
      }
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  const handleMultipleStakeAccountsConnectButton = () => {
    setMainStakeAccount(multipleStakeAccountsModalOption)
    handleCloseMultipleStakeAccountsModal()
  }

  // withdraw unlocked PYTH tokens to wallet
  const handleWithdraw = async () => {
    if (!amount) {
      toast.error('Please enter a valid amount!')
      return
    }
    const withdrawAmount = PythBalance.fromString(amount)
    if (withdrawAmount.gt(PythBalance.zero())) {
      if (mainStakeAccount) {
        setIsActionLoading(true)
        try {
          await stakeConnection?.withdrawTokens(
            mainStakeAccount,
            withdrawAmount
          )
          toast.success('Withdraw successful!')
        } catch (e) {
          toast.error(capitalizeFirstLetter(e.message))
        }
        setIsActionLoading(false)
        await refreshStakeAccount()
      } else {
        toast.error('Stake account is undefined.')
      }
    } else {
      toast.error('Amount must be greater than 0.')
    }
  }

  // refresh balances each time balances change
  const refreshBalance = async () => {
    if (stakeConnection && publicKey) {
      setPythBalance(
        await getPythTokenBalance(
          connection,
          publicKey,
          stakeConnection.config.pythTokenMint
        )
      )
    }
    if (stakeConnection && publicKey && mainStakeAccount) {
      const { withdrawable, locked, unvested } =
        mainStakeAccount.getBalanceSummary(await stakeConnection.getTime())
      setLockingPythBalance(locked.locking)
      setLockedPythBalance(locked.locked)
      setUnlockingPythBalance(locked.unlocking.add(locked.preunlocking))
      setUnvestedTotalPythBalance(unvested.total)
      setUnvestedLockingPythBalance(unvested.locking)
      setUnvestedLockedPythBalance(unvested.locked)
      setUnvestedPreUnlockingPythBalance(unvested.preunlocking)
      setUnvestedUnlockingPythBalance(unvested.unlocking)
      setUnvestedUnlockedPythBalance(unvested.unlocked)
      setUnlockedPythBalance(withdrawable)
      setIsBalanceLoading(false)
    }
  }

  const refreshStakeAccount = async () => {
    if (stakeConnection && publicKey) {
      setIsBalanceLoading(true)
      const stakeAccounts = await stakeConnection.getStakeAccounts(publicKey)
      if (stakeAccounts.length === 0) {
        setIsBalanceLoading(false)
      } else if (stakeAccounts.length === 1) {
        setMainStakeAccount(stakeAccounts[0])
      }
      for (const acc of stakeAccounts) {
        if (acc.address.toBase58() === mainStakeAccount?.address.toBase58()) {
          setMainStakeAccount(acc)
        }
      }
    }
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

  const openLockedModal = () => {
    setIsLockedModalOpen(true)
  }

  const closeLockedModal = () => {
    setIsLockedModalOpen(false)
  }

  const openUnlockedModal = () => {
    setIsUnlockedModalOpen(true)
  }

  const closeUnlockedModal = () => {
    setIsUnlockedModalOpen(false)
  }

  const openUnvestedModal = () => {
    setIsUnvestedModalOpen(true)
  }

  const closeUnvestedModal = () => {
    setIsUnvestedModalOpen(false)
  }

  const handleUnvestedModalLockAllButton = async () => {
    if (stakeConnection && mainStakeAccount) {
      try {
        await stakeConnection.lockAllUnvested(mainStakeAccount)
        toast.success('Successfully opted into governance!')
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
    }
    closeUnvestedModal()
    await refreshStakeAccount()
  }

  const handlePreliminaryUnstakeVestingAccount = async () => {
    if (stakeConnection && mainStakeAccount) {
      try {
        await stakeConnection.unlockBeforeVestingEvent(mainStakeAccount)
        toast.success(
          `${nextVestingAmount
            .add(lockedPythBalance)
            .toString()} tokens have started unlocking. You will be able to withdraw them after ${nextVestingDate?.toLocaleString()}`
        )
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
      closeUnvestedModal()
      await refreshStakeAccount()
    }
  }

  const handleUnlockAllVestingAccount = async () => {
    if (stakeConnection && mainStakeAccount) {
      try {
        await stakeConnection.unlockAll(mainStakeAccount)
        toast.success(
          `All unvested tokens have been unlocked. Please relock them to participate in governance.`
        )
      } catch (e) {
        toast.error(capitalizeFirstLetter(e.message))
      }
      closeUnvestedModal()
      await refreshStakeAccount()
    }
  }

  const unvestedModalText = () => {
    switch (currentVestingAccountState) {
      case VestingAccountState.UnvestedTokensPartiallyLocked:
        return (
          <>
            {unvestedLockedPythBalance
              .add(unvestedLockingPythBalance)
              .toString()}{' '}
            unvested tokens are locked in governance. <br />
            {unvestedUnlockedPythBalance.toString()} unvested tokens are
            unlocked. <br />
            {unvestedPreUnlockingPythBalance
              .add(unvestedUnlockingPythBalance)
              .toString()}{' '}
            unvested tokens are in cooldown period.
            <br />
            <br />
            Your {nextVestingAmount.toString()} tokens scheduled to vest on{' '}
            {nextVestingDate?.toLocaleString()} will be withdrawable on vest.
            <br />
            <br />
            The rest of your unvested tokens are participating in governance.
          </>
        )
      case VestingAccountState.UnvestedTokensFullyLockedExceptCooldown:
        return (
          <>
            {unvestedLockedPythBalance
              .add(unvestedLockingPythBalance)
              .toString()}{' '}
            tokens are locked in governance. <br />
            {unvestedPreUnlockingPythBalance
              .add(unvestedUnlockingPythBalance)
              .toString()}{' '}
            tokens are in cooldown period.
          </>
        )
      case VestingAccountState.UnvestedTokensFullyLocked:
        return (
          <>
            Your unvested tokens are locked in the contract to participate in
            governance. On vest, they will become locked tokens, which require a
            2 epoch cooldown to withdraw.
            <br />
            <br />
            If you would like to withdraw them immediately on vest, you may
            choose to preliminary unlock them now. This action will cause your{' '}
            {nextVestingAmount.toString()} tokens scheduled to vest on{' '}
            {nextVestingDate?.toLocaleString()} to become withdrawable on vest.
            <br />
            <br />
            You may also choose to unlock all of your unvested tokens,
            immediately reducing your governance power.
          </>
        )
      case VestingAccountState.UnvestedTokensFullyUnlocked:
        return (
          <>
            Your unvested tokens are not participating in governance. On vest,
            they will become unlocked tokens.
            <br />
            <br />
            Participating in governance requires you to lock your unvested
            tokens. This means that when your tokens vest, you will have to
            manually unlock them through by interacting with the UI and wait for
            a one epoch cooldown before being able to withdraw them.
          </>
        )
      case VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown:
        return (
          <>All of your unvested tokens are currently in cooldown period.</>
        )
    }
  }

  const unvestedModalButton = () => {
    switch (currentVestingAccountState) {
      case VestingAccountState.UnvestedTokensFullyLocked:
        return (
          <>
            <button
              type="button"
              className="primary-btn  py-3 px-8 text-base font-semibold  hover:bg-blueGemHover"
              onClick={handlePreliminaryUnstakeVestingAccount}
            >
              Preliminary unlock
            </button>
            <button
              type="button"
              className="primary-btn  py-3 px-8 text-base font-semibold  hover:bg-blueGemHover"
              onClick={handleUnlockAllVestingAccount}
            >
              Unlock all
            </button>
          </>
        )
      case VestingAccountState.FullyVested:
        return null
      default:
        return (
          <>
            <button
              type="button"
              className="primary-btn min-w-[145px] py-3 px-8 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
              onClick={handleUnvestedModalLockAllButton}
              disabled={
                currentVestingAccountState ==
                  VestingAccountState.UnvestedTokensFullyLockedExceptCooldown ||
                currentVestingAccountState ==
                  VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown
              }
            >
              {currentVestingAccountState ==
                VestingAccountState.UnvestedTokensFullyLockedExceptCooldown ||
              currentVestingAccountState ==
                VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown ? (
                <Tooltip
                  content="Your tokens are in the process of being unlocked."
                  className="m-4"
                >
                  Lock all
                </Tooltip>
              ) : (
                'Lock all'
              )}
            </button>
            <button
              type="button"
              className="primary-btn min-w-[145px] py-3 px-8 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
              onClick={handleUnlockAllVestingAccount}
              disabled={
                currentVestingAccountState ==
                  VestingAccountState.UnvestedTokensFullyUnlocked ||
                currentVestingAccountState ==
                  VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown
              }
            >
              {currentVestingAccountState ==
                VestingAccountState.UnvestedTokensFullyUnlocked ||
              currentVestingAccountState ==
                VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown ? (
                <Tooltip
                  content={
                    currentVestingAccountState ==
                    VestingAccountState.UnvestedTokensFullyUnlocked
                      ? "You don't have any unvested tokens to unlock."
                      : 'Your tokens are in the process of being unlocked.'
                  }
                  className="m-4"
                >
                  Unlock all
                </Tooltip>
              ) : (
                'Unlock all'
              )}
            </button>
          </>
        )
    }
  }

  return (
    <Layout>
      <SEO title={'Staking'} />
      <Transition appear show={isMultipleStakeAccountsModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => {}}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform rounded-2xl border-2 border-purpleHeart bg-jaguar p-10 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-md font-inter font-bold leading-6 "
                  >
                    Select stake account
                  </Dialog.Title>
                  <div className="mt-3">
                    <p className=" text-sm ">
                      Please choose the stake account you wish to connect to.
                    </p>
                  </div>
                  <Listbox
                    value={multipleStakeAccountsModalOption}
                    onChange={setMultipleStakeAccountsModalOption}
                  >
                    <div className="relative mt-1">
                      <Listbox.Button className="focus-visible:border-indigo-500 focus-visible:ring-white focus-visible:ring-offset-orange-300 relative my-4 w-full cursor-default rounded-lg bg-cherryPie py-2 pl-3 pr-10 text-left  shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-opacity-75 focus-visible:ring-offset-2 sm:text-sm">
                        <span className="block truncate">
                          {multipleStakeAccountsModalOption?.address
                            .toBase58()
                            .slice(0, 8) +
                            '..' +
                            multipleStakeAccountsModalOption?.address
                              .toBase58()
                              .slice(-8)}
                        </span>
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                          <SelectorIcon
                            className="text-gray-400 h-5 w-5"
                            aria-hidden="true"
                          />
                        </span>
                      </Listbox.Button>
                      <Transition
                        as={Fragment}
                        leave="transition ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                      >
                        <Listbox.Options className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-cherryPie py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                          {stakeAccounts.map((acc, idx) => (
                            <Listbox.Option
                              key={idx}
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                  active ? 'bg-pythPurple ' : ''
                                }`
                              }
                              value={acc}
                            >
                              {({ selected }) => (
                                <>
                                  <span
                                    className={`block truncate ${
                                      selected ? 'font-medium' : 'font-normal'
                                    }`}
                                  >
                                    {acc.address.toBase58().slice(0, 8) +
                                      '..' +
                                      acc.address.toBase58().slice(-8)}
                                  </span>
                                  {selected ? (
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 ">
                                      <CheckIcon
                                        className="h-5 w-5"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Transition>
                    </div>
                  </Listbox>
                  <div className="mt-4">
                    <button
                      type="button"
                      className="primary-btn py-3 px-8 text-base font-semibold  hover:bg-blueGemHover"
                      onClick={handleMultipleStakeAccountsConnectButton}
                    >
                      Connect
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isLockedModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsLockedModalOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="diaglogPanel ">
                  <button className="diaglogClose" onClick={closeLockedModal}>
                    <span className="mr-3">close</span> <CloseIcon />
                  </button>
                  <div className="max-w-md">
                    <Dialog.Title as="h3" className="diaglogTitle">
                      Locked tokens
                    </Dialog.Title>
                    <p className="mb-8 leading-6 ">
                      Locked tokens enables you to participate in Pyth Network
                      governance. Newly-locked tokens become eligible to vote in
                      governance at the beginning of the next epoch.
                    </p>
                    <p className="leading-6 ">
                      You currently have {lockedPythBalance?.toString()} locked
                      tokens.
                    </p>
                    {lockingPythBalance && !lockingPythBalance.isZero() ? (
                      <p className="mt-4 leading-6 ">
                        {lockingPythBalance.toString()} tokens will be locked
                        from the beginning of the next epoch.
                      </p>
                    ) : null}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isUnlockedModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsUnlockedModalOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="diaglogPanel">
                  <button className="diaglogClose" onClick={closeUnlockedModal}>
                    <span className="mr-3">close</span> <CloseIcon />
                  </button>

                  <div className="max-w-md">
                    <Dialog.Title as="h3" className="diaglogTitle">
                      Unlocked tokens
                    </Dialog.Title>
                    <p className="mb-6 leading-6">
                      Unlocking tokens enables you to withdraw them from the
                      program after a cooldown period of two epochs of which
                      they become unlocked tokens. Unlocked tokens cannot
                      participate in governance.
                    </p>
                    <p className="leading-6">
                      You currently have {unlockedPythBalance?.toString()}{' '}
                      unlocked tokens.
                    </p>
                    {unlockingPythBalance && !unlockingPythBalance.isZero() ? (
                      <p className="mt-4 leading-6">
                        {unlockingPythBalance.toString()} tokens have to go
                        through a cool-down period for 2 epochs before they can
                        be withdrawn.
                      </p>
                    ) : null}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <Transition appear show={isUnvestedModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsUnvestedModalOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="diaglogPanel">
                  <button className="diaglogClose" onClick={closeUnvestedModal}>
                    <span className="mr-3">close</span> <CloseIcon />
                  </button>
                  <div className="max-w-md">
                    <Dialog.Title as="h3" className="diaglogTitle">
                      Unvested tokens
                    </Dialog.Title>
                    <p className="mb-4">
                      You currently have {unvestedTotalPythBalance?.toString()}{' '}
                      unvested tokens.{' '}
                      {!unvestedTotalPythBalance.isZero()
                        ? `${nextVestingAmount.toString()} tokens
                      will vest on ${nextVestingDate?.toLocaleString()}.`
                        : null}
                      <br />
                      <br />
                      {unvestedModalText()}
                    </p>
                    <div className="flex flex-col items-center  space-y-4 text-center md:block md:space-x-10">
                      {unvestedModalButton()}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      <div className="mb-10 px-8  md:mb-20  ">
        <div className="mx-auto mt-2 w-full max-w-[796px]">
          <div className=" sm:mt-12 ">
            <div className="grid grid-cols-3 gap-2.5">
              {connected ? (
                <button
                  className="bg-darkGray text-center transition-colors hover:bg-darkGray2 md:text-left"
                  onClick={openLockedModal}
                >
                  <div className="flex flex-col items-center py-6 sm:px-6 md:flex-row md:items-start">
                    <div className="mb-2  md:mr-6 md:mb-0">
                      <LockedIcon />
                    </div>
                    <div className="flex flex-col justify-between py-2 text-sm">
                      <div className="mb-1 font-bold ">Locked </div>
                      {isBalanceLoading ? (
                        <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-darkGray4 md:m-0" />
                      ) : (
                        <div className="">
                          {lockedPythBalance?.toString()}{' '}
                          {lockingPythBalance &&
                          !lockingPythBalance.isZero() ? (
                            <div>
                              <Tooltip content="These tokens will be locked from the beginning of the next epoch.">
                                <div className="">
                                  (+{lockingPythBalance.toString()})
                                </div>
                              </Tooltip>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="flex flex-col items-center bg-darkGray py-6 text-center sm:px-6 md:flex-row md:items-start md:text-left">
                  <div className="mb-2  md:mr-6 md:mb-0">
                    <LockedIcon />
                  </div>
                  <div className="flex flex-col justify-between py-2 text-sm">
                    <div className="mb-1 font-bold">Locked</div>
                    <div>-</div>
                  </div>
                </div>
              )}
              {connected ? (
                <button
                  className="bg-darkGray text-center transition-colors hover:bg-darkGray2 md:text-left"
                  onClick={openUnlockedModal}
                >
                  <div className="flex flex-col items-center py-6 sm:px-6 md:flex-row md:items-start">
                    <div className="mb-2  md:mr-6 md:mb-0">
                      <UnlockedIcon />
                    </div>
                    <div className="flex flex-col justify-between py-2 text-sm">
                      <div className="mb-1 font-bold">Unlocked </div>
                      {isBalanceLoading ? (
                        <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-darkGray4 md:m-0" />
                      ) : (
                        <div className="">
                          {unlockedPythBalance?.toString()}{' '}
                          {unlockingPythBalance &&
                          !unlockingPythBalance.isZero() ? (
                            <div>
                              <Tooltip content="These tokens have to go through a cool-down period for 2 epochs before they can be withdrawn.">
                                <div className="">
                                  (+{unlockingPythBalance.toString()})
                                </div>
                              </Tooltip>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="flex flex-col items-center bg-darkGray py-6 text-center sm:px-6 md:flex-row md:items-start md:text-left">
                  <div className="mb-2  md:mr-6 md:mb-0">
                    <UnlockedIcon />
                  </div>

                  <div className="flex flex-col justify-between py-2 text-sm">
                    <div className="mb-1 font-bold">Unlocked</div>
                    <div>-</div>
                  </div>
                </div>
              )}
              {connected ? (
                <button
                  className="bg-darkGray text-center transition-colors hover:bg-darkGray2 md:text-left"
                  onClick={openUnvestedModal}
                >
                  <div className="flex flex-col items-center py-6 sm:px-6 md:flex-row md:items-start">
                    <div className="mb-2  md:mr-6 md:mb-0">
                      <UnvestedIcon />
                    </div>
                    <div className="flex flex-col justify-between py-2 text-sm">
                      <div className="mb-1 font-bold">Unvested</div>
                      {isBalanceLoading ? (
                        <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-darkGray4 md:m-0" />
                      ) : (
                        <div className="">
                          {unvestedTotalPythBalance?.toString()}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ) : (
                <div className="flex flex-col items-center bg-darkGray py-6 text-center sm:px-6 md:flex-row md:items-start md:text-left">
                  <div className="mb-2  md:mr-6 md:mb-0">
                    <UnvestedIcon />
                  </div>

                  <div className="flex flex-col justify-between py-2 text-sm">
                    <div className="mb-1 font-bold">Unvested</div>
                    <div>-</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 bg-darkGray px-4 sm:px-14 md:px-5">
            <div className="py-8">
              <Tab.Group onChange={handleChangeTab}>
                <Tab.List className="mx-auto grid max-w-[526px] grid-cols-3 gap-1 text-center sm:gap-2.5">
                  {Object.values(TabEnum)
                    .slice(3)
                    .map((v) => (
                      <Tab
                        key={v}
                        className={({ selected }) =>
                          classNames(
                            'bg-darkGray2 py-3  text-xs  font-semibold uppercase  outline-none  transition-colors md:text-base',

                            selected ? 'bg-darkGray3' : ' hover:bg-darkGray3'
                          )
                        }
                      >
                        {TabEnum[v as keyof typeof TabEnum]}
                      </Tab>
                    ))}
                </Tab.List>
                <Tab.Panels className="mt-4 sm:mt-11">
                  {Object.keys(TabEnum)
                    .slice(3)
                    .map((v, idx) => (
                      <Tab.Panel key={idx}>
                        <div className="mx-auto max-w-xl text-center leading-6">
                          <div className="mb-4 h-36  sm:mb-12 sm:h-16">
                            {tabDescriptions[v as keyof typeof TabEnum]}
                          </div>

                          <div className="mb-4 flex items-end justify-between md:items-center ">
                            <label htmlFor="amount" className="block ">
                              Amount (PYTH)
                            </label>
                            <div className="ml-auto mr-0 flex flex-col-reverse items-end space-x-2 md:flex-row md:items-center">
                              {isBalanceLoading ? (
                                <div className="h-5 w-14  animate-pulse rounded-lg bg-darkGray4" />
                              ) : (
                                <p className="mt-2 md:mt-0">
                                  {currentTab === TabEnum.Lock
                                    ? 'Balance'
                                    : currentTab === TabEnum.Unlock
                                    ? 'Locked Tokens'
                                    : 'Withdrawable'}
                                  : {connected ? balance?.toString() : '-'}
                                </p>
                              )}
                              <div className="mb-2  flex space-x-2 md:mb-0">
                                <button
                                  className="outlined-btn hover:bg-darkGray4"
                                  onClick={handleHalfBalanceClick}
                                >
                                  Half
                                </button>
                                <button
                                  className="outlined-btn hover:bg-darkGray4"
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
                            className="input-no-spin mt-1 mb-8 block h-14 w-full rounded-full bg-darkGray4 px-4 text-center text-lg font-semibold  focus:outline-none"
                          />

                          <div className="flex items-center justify-center ">
                            {!connected ? (
                              <WalletModalButton className="secondary-btn pt-0.5 text-xs" />
                            ) : currentTab === TabEnum.Lock ? (
                              <button
                                className="action-btn text-base "
                                onClick={handleDeposit}
                                disabled={
                                  isLockButtonDisabled ||
                                  !isSufficientBalance ||
                                  isActionLoading
                                }
                              >
                                {isActionLoading ? (
                                  <Spinner />
                                ) : isLockButtonDisabled ? (
                                  <Tooltip content="You are currently not enrolled in governance.">
                                    Lock
                                  </Tooltip>
                                ) : isSufficientBalance ? (
                                  'Lock'
                                ) : (
                                  'Insufficient Balance'
                                )}
                              </button>
                            ) : currentTab === TabEnum.Unlock ? (
                              <button
                                className="action-btn font-base"
                                onClick={handleUnlock}
                                disabled={
                                  isLockButtonDisabled ||
                                  !isSufficientBalance ||
                                  isActionLoading
                                }
                              >
                                {isActionLoading ? (
                                  <Spinner />
                                ) : isLockButtonDisabled ? (
                                  <Tooltip content="You are currently not enrolled in governance.">
                                    Unlock
                                  </Tooltip>
                                ) : isSufficientBalance ? (
                                  'Unlock'
                                ) : (
                                  'Insufficient Balance'
                                )}
                              </button>
                            ) : (
                              <button
                                className="action-btn font-base"
                                onClick={handleWithdraw}
                                disabled={
                                  !isSufficientBalance || isActionLoading
                                }
                              >
                                {isActionLoading ? (
                                  <Spinner />
                                ) : isSufficientBalance ? (
                                  'Withdraw'
                                ) : (
                                  'Insufficient Balance'
                                )}
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
      </div>
    </Layout>
  )
}

export default Staking
