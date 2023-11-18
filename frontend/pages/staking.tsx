import Tooltip from '@components/Tooltip'
import { Dialog, Listbox, Tab, Transition } from '@headlessui/react'
import { CheckIcon, SelectorIcon } from '@heroicons/react/solid'
import { StakeAccount } from '@pythnetwork/staking'
import { useAnchorWallet } from '@solana/wallet-adapter-react'
import type { NextPage } from 'next'
import { Fragment, useEffect, useState } from 'react'
import { classNames } from 'utils/classNames'
import Layout from '../components/Layout'
import SEO from '../components/SEO'

import LockedIcon from '@components/icons/LockedIcon'
import UnlockedIcon from '@components/icons/UnlockedIcon'
import UnvestedIcon from '@components/icons/UnvestedIcon'
import { StakedModal } from '@components/modals/StakedModal'
import { UnstakedModal } from '@components/modals/UnstakedModal'
import { useStakeAccounts } from 'hooks/useStakeAccounts'
import { useBalance } from 'hooks/useBalance'
import { useVestingAccountState } from 'hooks/useVestingAccountState'
import { LockedModal } from '@components/modals/LockedModal'
import { StakePanel } from '@components/panels/StakePanel'
import { UnstakePanel } from '@components/panels/UnstakePanel'
import { WithdrawPanel } from '@components/panels/WithdrawPanel'
import { useStakeConnection } from 'hooks/useStakeConnection'

enum TabEnum {
  Stake,
  Unstake,
  Withdraw,
}

const Staking: NextPage = () => {
  const [
    isMultipleStakeAccountsModalOpen,
    setIsMultipleStakeAccountsModalOpen,
  ] = useState<boolean>(false)
  const [isStakedModalOpen, setIsStakedModalOpen] = useState<boolean>(false)
  const [isUnstakedModalOpen, setIsUnstakedModalOpen] = useState<boolean>(false)
  const [isLockedModalOpen, setIsLockedModalOpen] = useState<boolean>(false)
  const [
    multipleStakeAccountsModalOption,
    setMultipleStakeAccountsModalOption,
  ] = useState<StakeAccount>()

  const wallet = useAnchorWallet()
  const isWalletConnected = wallet !== undefined

  const { isLoading: isStakeConnectionLoading } = useStakeConnection()
  const { data: stakeAccounts, isLoading: isStakeAccountsLoading } =
    useStakeAccounts()

  // if things are loading, mainStakeAccount is undefined
  // else if there are no previous stakeAccount, mainStakeAccount is null
  // else mainStakeAccount is defined
  const [mainStakeAccount, setMainStakeAccount] = useState<
    StakeAccount | undefined | null
  >()

  // set main stake account
  useEffect(() => {
    if (stakeAccounts !== undefined) {
      if (stakeAccounts.length === 1) setMainStakeAccount(stakeAccounts[0])
      else if (stakeAccounts.length > 1) {
        // user has selected the stake account previously
        if (mainStakeAccount !== undefined && mainStakeAccount !== null) {
          // select the previous main stake account
          for (const acc of stakeAccounts) {
            if (
              acc.address.toBase58() === mainStakeAccount.address.toBase58()
            ) {
              setMainStakeAccount(acc)
            }
          }
        } else {
          setIsMultipleStakeAccountsModalOpen(true)
          setMultipleStakeAccountsModalOption(stakeAccounts[0])
        }
      } else {
        setMainStakeAccount(null)
        setMultipleStakeAccountsModalOption(undefined)
      }
    } else {
      setMainStakeAccount(undefined)
      setMultipleStakeAccountsModalOption(undefined)
    }
  }, [stakeAccounts])

  const { data: balance, isLoading: isBalanceLoading } =
    useBalance(mainStakeAccount)

  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.Stake)

  const { data: currentVestingAccountState } =
    useVestingAccountState(mainStakeAccount)

  // First stake connection will load, then stake accounts, and
  // then if a main stake account exists, the balance will load
  // else the balance won't load, it will be undefined

  // hence this will be false when all the loading is completed
  const isLoading =
    isStakeConnectionLoading || isStakeAccountsLoading || isBalanceLoading

  const handleCloseMultipleStakeAccountsModal = () => {
    setIsMultipleStakeAccountsModalOpen(false)
  }

  const handleMultipleStakeAccountsConnectButton = () => {
    setMainStakeAccount(multipleStakeAccountsModalOption)
    handleCloseMultipleStakeAccountsModal()
  }

  // set current tab value when tab is clicked
  const handleChangeTab = (index: number) => {
    setCurrentTab(index as TabEnum)
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
                          {stakeAccounts?.map((acc, idx) => (
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
                      className="primary-btn px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
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

      <StakedModal
        setIsStakedModalOpen={setIsStakedModalOpen}
        isStakedModalOpen={isStakedModalOpen}
        stakedPythBalance={balance?.lockedPythBalance}
        stakingPythBalance={balance?.lockingPythBalance}
      />

      <UnstakedModal
        isUnstakedModalOpen={isUnstakedModalOpen}
        setIsUnstakedModalOpen={setIsUnstakedModalOpen}
        unstakedPythBalance={balance?.unlockedPythBalance}
        unstakingPythBalance={balance?.unlockingPythBalance}
      />

      <LockedModal
        isLockedModalOpen={isLockedModalOpen}
        setIsLockedModalOpen={setIsLockedModalOpen}
        mainStakeAccount={mainStakeAccount}
        currentVestingAccountState={currentVestingAccountState}
      />

      <div className="mb-10 px-8  md:mb-20  ">
        <div className="mx-auto mt-2 w-full max-w-[796px]">
          <div className=" sm:mt-12 ">
            <div className="grid grid-cols-3 gap-2.5">
              <button
                className={classNames(
                  'bg-darkGray text-center transition-colors  md:text-left',
                  isWalletConnected && balance ? 'hover:bg-darkGray2' : ''
                )}
                onClick={() => setIsStakedModalOpen(true)}
                disabled={!isWalletConnected || !balance}
              >
                <div className="flex flex-col items-center py-6 sm:px-6 md:flex-row md:items-start">
                  <div className="mb-2  md:mb-0 md:mr-6">
                    <LockedIcon />
                  </div>
                  <div className="flex flex-col justify-between py-2 text-sm">
                    <div className="mb-1 font-bold ">Staked </div>
                    {isLoading ? (
                      <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-darkGray4 md:m-0" />
                    ) : balance === undefined ? (
                      <div>-</div>
                    ) : (
                      <div className="">
                        {balance.lockedPythBalance?.toString()}{' '}
                        {balance.lockingPythBalance &&
                        !balance.lockingPythBalance.isZero() ? (
                          <div>
                            <Tooltip content="These tokens will be staked from the beginning of the next epoch.">
                              <div className="">
                                (+{balance.lockingPythBalance.toString()})
                              </div>
                            </Tooltip>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              <button
                className={classNames(
                  'bg-darkGray text-center transition-colors  md:text-left',
                  isWalletConnected && balance ? 'hover:bg-darkGray2' : ''
                )}
                onClick={() => setIsUnstakedModalOpen(true)}
                disabled={!isWalletConnected || !balance}
              >
                <div className="flex flex-col items-center py-6 sm:px-6 md:flex-row md:items-start">
                  <div className="mb-2  md:mb-0 md:mr-6">
                    <UnlockedIcon />
                  </div>
                  <div className="flex flex-col justify-between py-2 text-sm">
                    <div className="mb-1 font-bold">Unstaked </div>
                    {isLoading ? (
                      <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-darkGray4 md:m-0" />
                    ) : balance === undefined ? (
                      <div>-</div>
                    ) : (
                      <div className="">
                        {balance.unlockedPythBalance?.toString()}{' '}
                        {balance.unlockingPythBalance &&
                        !balance.unlockingPythBalance.isZero() ? (
                          <div>
                            <Tooltip content="These tokens have to go through a cool-down period for 2 epochs before they can be withdrawn.">
                              <div className="">
                                (+{balance.unlockingPythBalance.toString()})
                              </div>
                            </Tooltip>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              <button
                className={classNames(
                  'bg-darkGray text-center transition-colors  md:text-left',
                  isWalletConnected && balance ? 'hover:bg-darkGray2' : ''
                )}
                onClick={() => setIsLockedModalOpen(true)}
                disabled={!isWalletConnected || !balance}
              >
                <div className="flex flex-col items-center py-6 sm:px-6 md:flex-row md:items-start">
                  <div className="mb-2  md:mb-0 md:mr-6">
                    <UnvestedIcon />
                  </div>
                  <div className="flex flex-col justify-between py-2 text-sm">
                    <div className="mb-1 font-bold">Locked</div>
                    {isLoading ? (
                      <div className="mx-auto h-5 w-14 animate-pulse rounded-lg bg-darkGray4 md:m-0" />
                    ) : balance === undefined ? (
                      <div>-</div>
                    ) : (
                      <div className="">
                        {balance.unvestedTotalPythBalance?.toString()}
                      </div>
                    )}
                  </div>
                </div>
              </button>
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
                        {currentTab === TabEnum.Stake ? (
                          <StakePanel mainStakeAccount={mainStakeAccount} />
                        ) : currentTab === TabEnum.Unstake ? (
                          <UnstakePanel mainStakeAccount={mainStakeAccount} />
                        ) : (
                          <WithdrawPanel mainStakeAccount={mainStakeAccount} />
                        )}
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
