import {
  PythBalance,
  StakeAccount,
  VestingAccountState,
} from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'
import Tooltip from '@components/Tooltip'
import { useUnvestedLockAllMutation } from 'hooks/useUnvestedLockAllMutation'
import { useUnvestedPreUnlockAllMutation } from 'hooks/useUnvestedPreUnlockAllMutation'
import { useUnvestedUnlockAllMutation } from 'hooks/useUnvestedUnlockAllMutation'
import { useBalance } from 'hooks/useBalance'
import { useNextVestingEvent } from 'hooks/useNextVestingEvent'

export type UnvestedModalProps = {
  isUnvestedModalOpen: boolean
  setIsUnvestedModalOpen: (open: boolean) => void
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount: StakeAccount | undefined
}
export function UnvestedModal({
  isUnvestedModalOpen,
  setIsUnvestedModalOpen,
  currentVestingAccountState,
  mainStakeAccount,
}: UnvestedModalProps) {
  const { data: balanceData, isLoading: _isBalanceLoading } =
    useBalance(mainStakeAccount)

  const {
    unvestedTotalPythBalance,
    unvestedLockingPythBalance,
    unvestedLockedPythBalance,
    unvestedPreUnlockingPythBalance,
    unvestedUnlockingPythBalance,
    unvestedUnlockedPythBalance,
  } = balanceData ?? {}

  const { data: nextVestingEvent } = useNextVestingEvent(mainStakeAccount)
  const { nextVestingDate, nextVestingAmount } = nextVestingEvent ?? {}

  return (
    <BaseModal
      title="Unvested tokens"
      isModalOpen={isUnvestedModalOpen}
      setIsModalOpen={setIsUnvestedModalOpen}
    >
      <p className="mb-4">
        You currently have {unvestedTotalPythBalance?.toString()} unvested
        tokens.{' '}
        {nextVestingDate && !unvestedTotalPythBalance?.isZero()
          ? `${nextVestingAmount?.toString()} tokens
                      will vest on ${nextVestingDate?.toLocaleString()}.`
          : null}
        <br />
        <br />
        <UnvestedModalCurrentState
          currentVestingAccountState={currentVestingAccountState}
          unvestedLockedPythBalance={
            unvestedLockedPythBalance ?? PythBalance.zero()
          }
          unvestedLockingPythBalance={
            unvestedLockingPythBalance ?? PythBalance.zero()
          }
          unvestedUnlockedPythBalance={
            unvestedUnlockedPythBalance ?? PythBalance.zero()
          }
          unvestedPreUnlockingPythBalance={
            unvestedPreUnlockingPythBalance ?? PythBalance.zero()
          }
          unvestedUnlockingPythBalance={
            unvestedUnlockingPythBalance ?? PythBalance.zero()
          }
          nextVestingAmount={nextVestingAmount ?? PythBalance.zero()}
          nextVestingDate={nextVestingDate}
        />
      </p>
      <div className="flex flex-col items-center  space-y-4 text-center md:block md:space-x-10">
        <UnvestedModalButton
          currentVestingAccountState={currentVestingAccountState}
          mainStakeAccount={mainStakeAccount}
        />
      </div>
    </BaseModal>
  )
}

type UnvestedModalCurrentStateProps = {
  currentVestingAccountState: VestingAccountState | undefined
  unvestedLockedPythBalance: PythBalance
  unvestedLockingPythBalance: PythBalance
  unvestedUnlockedPythBalance: PythBalance
  unvestedPreUnlockingPythBalance: PythBalance
  unvestedUnlockingPythBalance: PythBalance
  nextVestingAmount: PythBalance
  nextVestingDate: Date | undefined
}
function UnvestedModalCurrentState({
  currentVestingAccountState,
  unvestedLockedPythBalance,
  unvestedLockingPythBalance,
  unvestedUnlockedPythBalance,
  unvestedPreUnlockingPythBalance,
  unvestedUnlockingPythBalance,
  nextVestingAmount,
  nextVestingDate,
}: UnvestedModalCurrentStateProps) {
  switch (currentVestingAccountState) {
    case VestingAccountState.UnvestedTokensPartiallyLocked:
      return (
        <>
          {unvestedLockedPythBalance.add(unvestedLockingPythBalance).toString()}{' '}
          unvested tokens are locked in governance. <br />
          {unvestedUnlockedPythBalance.toString()} unvested tokens are unlocked.{' '}
          <br />
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
          {unvestedLockedPythBalance.add(unvestedLockingPythBalance).toString()}{' '}
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
          governance. On vest, they will become locked tokens, which require a 2
          epoch cooldown to withdraw.
          <br />
          <br />
          If you would like to withdraw them immediately on vest, you may choose
          to preliminary unlock them now. This action will cause your{' '}
          {nextVestingAmount.toString()} tokens scheduled to vest on{' '}
          {nextVestingDate?.toLocaleString()} to become withdrawable on vest.
          <br />
          <br />
          You may also choose to unlock all of your unvested tokens, immediately
          reducing your governance power.
        </>
      )
    case VestingAccountState.UnvestedTokensFullyUnlocked:
      return (
        <>
          Your unvested tokens are not participating in governance. On vest,
          they will become unlocked tokens.
          <br />
          <br />
          Participating in governance requires you to lock your unvested tokens.
          This means that when your tokens vest, you will have to manually
          unlock them through by interacting with the UI and wait for a one
          epoch cooldown before being able to withdraw them.
        </>
      )
    case VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown:
      return <>All of your unvested tokens are currently in cooldown period.</>
  }
}

type UnvestedModalButtonProps = {
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount?: StakeAccount
}
function UnvestedModalButton({
  currentVestingAccountState,
  mainStakeAccount,
}: UnvestedModalButtonProps) {
  const unvestedLockAll = useUnvestedLockAllMutation()
  const unvestedPreUnlockAll = useUnvestedPreUnlockAllMutation()
  const unvestedUnlockAll = useUnvestedUnlockAllMutation()

  switch (currentVestingAccountState) {
    case VestingAccountState.UnvestedTokensFullyLocked:
      return (
        <>
          <button
            type="button"
            className="primary-btn  px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
            onClick={() => unvestedPreUnlockAll.mutate(mainStakeAccount)}
          >
            Preliminary unlock
          </button>
          <button
            type="button"
            className="primary-btn  px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
            onClick={() => unvestedUnlockAll.mutate(mainStakeAccount)}
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
            className="primary-btn min-w-[145px] px-8 py-3 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
            onClick={() => unvestedLockAll.mutate(mainStakeAccount)}
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
            className="primary-btn min-w-[145px] px-8 py-3 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
            onClick={() => unvestedUnlockAll.mutate(mainStakeAccount)}
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
