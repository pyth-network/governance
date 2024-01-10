import {
  PythBalance,
  StakeAccount,
  VestingAccountState,
} from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'
import Tooltip from '@components/Tooltip'
import { useStakeLockedMutation } from 'hooks/useStakeLockedMutation'
import { usePreunstakeLockedMutation } from 'hooks/usePreunstakeLockedMutation'
import { useBalance } from 'hooks/useBalance'
import { useNextVestingEvent } from 'hooks/useNextVestingEvent'
import { useStakeConnection } from 'hooks/useStakeConnection'
import { MainStakeAccount } from 'pages'
import { useState } from 'react'
import { LockedTokenActionModal } from './LockedTokenActionModal'
import { useUnstakeLockedMutation } from 'hooks/useUnstakeLockedMutation'

export type LockedModalProps = {
  isLockedModalOpen: boolean
  setIsLockedModalOpen: (open: boolean) => void
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount: MainStakeAccount
}
export function LockedModal({
  isLockedModalOpen,
  setIsLockedModalOpen,
  currentVestingAccountState,
  mainStakeAccount,
}: LockedModalProps) {
  const { data: stakeConnection } = useStakeConnection()

  const { data: balanceData, isLoading: _isBalanceLoading } =
    useBalance(mainStakeAccount)

  const {
    lockedPythBalance = PythBalance.zero(),
    lockingPythBalance = PythBalance.zero(),
    unvestedTotalPythBalance = PythBalance.zero(),
    unvestedLockingPythBalance = PythBalance.zero(),
    unvestedLockedPythBalance = PythBalance.zero(),
    unvestedPreUnlockingPythBalance = PythBalance.zero(),
    unvestedUnlockingPythBalance = PythBalance.zero(),
    unvestedUnlockedPythBalance = PythBalance.zero(),
  } = balanceData ?? {}

  const { data: nextVestingEvent } = useNextVestingEvent(mainStakeAccount)
  const { nextVestingDate, nextVestingAmount = PythBalance.zero() } =
    nextVestingEvent ?? {}

  const [isStakeLockedModalOpen, setIsStakeLockedModalOpen] =
    useState<boolean>(false)
  const [isUnstakeLockedModalOpen, setIsUnstakeLockedModalOpen] =
    useState<boolean>(false)

  const stakeLockedMutation = useStakeLockedMutation()
  const unstakedLockedMutation = useUnstakeLockedMutation()

  return (
    <>
      <LockedTokenActionModal
        isModalOpen={isStakeLockedModalOpen}
        setIsModalOpen={setIsStakeLockedModalOpen}
        title={'Stake locked tokens'}
        actionLabel="Stake"
        mainStakeAccount={mainStakeAccount}
        balance={unvestedUnlockedPythBalance}
        // These casts are safe because the button is disabled if the mainStakeAccount or stakeConnection is undefined
        onAction={(amount) =>
          stakeLockedMutation.mutate({
            amount,
            stakeConnection: stakeConnection!,
            mainStakeAccount: mainStakeAccount as StakeAccount,
          })
        }
      />
      <LockedTokenActionModal
        isModalOpen={isUnstakeLockedModalOpen}
        setIsModalOpen={setIsUnstakeLockedModalOpen}
        title={'Unstake locked tokens'}
        actionLabel="Unstake"
        mainStakeAccount={mainStakeAccount}
        balance={lockedPythBalance
          .add(lockingPythBalance)
          .add(unvestedLockedPythBalance)
          .add(unvestedLockingPythBalance)}
        // These casts are safe because the button is disabled if the mainStakeAccount or stakeConnection is undefined
        onAction={(amount) =>
          unstakedLockedMutation.mutate({
            amount,
            stakeConnection: stakeConnection!,
            mainStakeAccount: mainStakeAccount as StakeAccount,
          })
        }
      />
      <BaseModal
        title="Locked tokens"
        isModalOpen={isLockedModalOpen}
        setIsModalOpen={setIsLockedModalOpen}
      >
        <p className="mb-4">
          You currently have {unvestedTotalPythBalance?.toString()} locked
          tokens.{' '}
          {nextVestingDate && !unvestedTotalPythBalance?.isZero()
            ? `${nextVestingAmount?.toString()} tokens
                      will unlock on ${nextVestingDate?.toLocaleString()}.`
            : null}
          <br />
          <br />
          <LockedModalCurrentState
            currentVestingAccountState={currentVestingAccountState}
            unvestedLockedPythBalance={unvestedLockedPythBalance}
            unvestedLockingPythBalance={unvestedLockingPythBalance}
            unvestedUnlockedPythBalance={unvestedUnlockedPythBalance}
            unvestedPreUnlockingPythBalance={unvestedPreUnlockingPythBalance}
            unvestedUnlockingPythBalance={unvestedUnlockingPythBalance}
            nextVestingAmount={nextVestingAmount}
            nextVestingDate={nextVestingDate}
          />
        </p>

        <div className="flex flex-col items-center  space-y-4 text-center md:block md:space-x-10">
          <LockedModalButton
            currentVestingAccountState={currentVestingAccountState}
            mainStakeAccount={mainStakeAccount}
            setIsStakeLockedModalOpen={setIsStakeLockedModalOpen}
            setIsUnstakeLockedModalOpen={setIsUnstakeLockedModalOpen}
          />
        </div>
      </BaseModal>
    </>
  )
}

type LockedModalCurrentStateProps = {
  currentVestingAccountState: VestingAccountState | undefined
  unvestedLockedPythBalance: PythBalance
  unvestedLockingPythBalance: PythBalance
  unvestedUnlockedPythBalance: PythBalance
  unvestedPreUnlockingPythBalance: PythBalance
  unvestedUnlockingPythBalance: PythBalance
  nextVestingAmount: PythBalance
  nextVestingDate: Date | undefined
}
function LockedModalCurrentState({
  currentVestingAccountState,
  unvestedLockedPythBalance,
  unvestedLockingPythBalance,
  unvestedUnlockedPythBalance,
  unvestedPreUnlockingPythBalance,
  unvestedUnlockingPythBalance,
  nextVestingAmount,
  nextVestingDate,
}: LockedModalCurrentStateProps) {
  switch (currentVestingAccountState) {
    case VestingAccountState.UnvestedTokensPartiallyLocked:
      return (
        <>
          {unvestedLockedPythBalance.add(unvestedLockingPythBalance).toString()}{' '}
          locked tokens are staked in governance. <br />
          {unvestedUnlockedPythBalance.toString()} locked tokens are unstaked.{' '}
          <br />
          {unvestedPreUnlockingPythBalance
            .add(unvestedUnlockingPythBalance)
            .toString()}{' '}
          locked tokens are in cooldown period.
          <br />
          <br />
          Your {nextVestingAmount.toString()} tokens scheduled to unlock on{' '}
          {nextVestingDate?.toLocaleString()} will be withdrawable.
          <br />
          <br />
        </>
      )
    case VestingAccountState.UnvestedTokensFullyLockedExceptCooldown:
      return (
        <>
          {unvestedLockedPythBalance.add(unvestedLockingPythBalance).toString()}{' '}
          tokens are staked in governance. <br />
          {unvestedPreUnlockingPythBalance
            .add(unvestedUnlockingPythBalance)
            .toString()}{' '}
          tokens are in cooldown period.
        </>
      )
    case VestingAccountState.UnvestedTokensFullyLocked:
      return (
        <>
          Your locked tokens are staked in the contract to participate in
          governance. On vest, they will become staked tokens, which require a
          full epoch cooldown to be unstaked. (Epochs start every Thursday at
          00:00 UTC and last 7 days)
          <br />
          <br />
          If you would like to withdraw them immediately on unlock, you may
          choose to preliminary unstake them now. This action will cause your{' '}
          {nextVestingAmount.toString()} tokens scheduled to unstake on{' '}
          {nextVestingDate?.toLocaleString()} to become withdrawable on unlock.
          <br />
          <br />
          You may also choose to unstake all of your locked tokens, immediately
          reducing your governance power.
        </>
      )
    case VestingAccountState.UnvestedTokensFullyUnlocked:
      return (
        <>
          Your locked tokens are not participating in governance. On unlock,
          they will become withdrawable tokens.
          <br />
          <br />
          Participating in governance requires you to stake your locked tokens.
          This means that when your tokens unlock, you will have to manually
          unstake them by interacting with the UI and wait for a cooldown of one
          full epoch before being able to withdraw them. (Epochs start every
          Thursday at 00:00 UTC and last 7 days).
        </>
      )
    case VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown:
      return <>All of your locked tokens are currently in cooldown period.</>
  }
}

type LockedModalButtonProps = {
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount: MainStakeAccount
  setIsStakeLockedModalOpen: (open: boolean) => void
  setIsUnstakeLockedModalOpen: (open: boolean) => void
}
function LockedModalButton({
  currentVestingAccountState,
  mainStakeAccount,
  setIsStakeLockedModalOpen,
  setIsUnstakeLockedModalOpen,
}: LockedModalButtonProps) {
  if (mainStakeAccount === 'NA') return <></>

  switch (currentVestingAccountState) {
    case VestingAccountState.UnvestedTokensFullyLocked:
      return (
        <>
          <PreliminaryUnstakeButton mainStakeAccount={mainStakeAccount} />
          <UnstakeButton
            currentVestingAccountState={currentVestingAccountState}
            mainStakeAccount={mainStakeAccount}
            setIsUnstakeLockedModalOpen={setIsUnstakeLockedModalOpen}
          />
        </>
      )
    case VestingAccountState.FullyVested:
      return null
    default:
      return (
        <>
          <StakeButton
            currentVestingAccountState={currentVestingAccountState}
            mainStakeAccount={mainStakeAccount}
            setIsStakeLockedModalOpen={setIsStakeLockedModalOpen}
          />
          <UnstakeButton
            currentVestingAccountState={currentVestingAccountState}
            mainStakeAccount={mainStakeAccount}
            setIsUnstakeLockedModalOpen={setIsUnstakeLockedModalOpen}
          />
        </>
      )
  }
}

function PreliminaryUnstakeButton({
  mainStakeAccount,
}: {
  mainStakeAccount: MainStakeAccount
}) {
  const { data: stakeConnection } = useStakeConnection()
  const unvestedPreUnlockAll = usePreunstakeLockedMutation()

  return (
    <button
      type="button"
      className="primary-btn min-w-[145px] px-8 py-3 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
      onClick={() =>
        unvestedPreUnlockAll.mutate({
          mainStakeAccount: mainStakeAccount as StakeAccount,
          stakeConnection: stakeConnection!,
        })
      }
      disabled={mainStakeAccount === undefined || stakeConnection === undefined}
    >
      Preliminary unstake
    </button>
  )
}

function UnstakeButton({
  currentVestingAccountState,
  mainStakeAccount,
  setIsUnstakeLockedModalOpen,
}: {
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount: MainStakeAccount
  setIsUnstakeLockedModalOpen: (open: boolean) => void
}) {
  const { data: stakeConnection } = useStakeConnection()

  return (
    <button
      type="button"
      className="primary-btn min-w-[145px] px-8 py-3 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
      onClick={() => setIsUnstakeLockedModalOpen(true)}
      disabled={
        currentVestingAccountState ==
          VestingAccountState.UnvestedTokensFullyUnlocked ||
        currentVestingAccountState ==
          VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown ||
        mainStakeAccount === undefined ||
        stakeConnection === undefined
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
              ? "You don't have any locked tokens to unstake."
              : 'Your tokens are in the process of being unstaked.'
          }
          className="m-4"
        >
          Unstake
        </Tooltip>
      ) : (
        'Unstake'
      )}
    </button>
  )
}

function StakeButton({
  currentVestingAccountState,
  mainStakeAccount,
  setIsStakeLockedModalOpen,
}: {
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount: MainStakeAccount
  setIsStakeLockedModalOpen: (open: boolean) => void
}) {
  const { data: stakeConnection } = useStakeConnection()

  return (
    <button
      type="button"
      className="primary-btn min-w-[145px] px-8 py-3 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
      onClick={() => setIsStakeLockedModalOpen(true)}
      disabled={
        currentVestingAccountState ==
          VestingAccountState.UnvestedTokensFullyLockedExceptCooldown ||
        currentVestingAccountState ==
          VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown ||
        mainStakeAccount === undefined ||
        stakeConnection === undefined
      }
    >
      {currentVestingAccountState ==
        VestingAccountState.UnvestedTokensFullyLockedExceptCooldown ||
      currentVestingAccountState ==
        VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown ? (
        <Tooltip
          content="Your tokens are in the process of being unstaked."
          className="m-4"
        >
          Stake
        </Tooltip>
      ) : (
        'Stake'
      )}
    </button>
  )
}
