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
import { useStakeConnection } from 'hooks/useStakeConnection'
import { MainStakeAccount } from 'pages/staking'

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
      title="Locked tokens"
      isModalOpen={isLockedModalOpen}
      setIsModalOpen={setIsLockedModalOpen}
    >
      <p className="mb-4">
        You currently have {unvestedTotalPythBalance?.toString()} locked tokens.{' '}
        {nextVestingDate && !unvestedTotalPythBalance?.isZero()
          ? `${nextVestingAmount?.toString()} tokens
                      will unlock on ${nextVestingDate?.toLocaleString()}.`
          : null}
        <br />
        <br />
        <LockedModalCurrentState
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
        <LockedModalButton
          currentVestingAccountState={currentVestingAccountState}
          mainStakeAccount={mainStakeAccount}
        />
      </div>
    </BaseModal>
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
          full epoch cooldown to be unstaked.
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
          full epoch before being able to withdraw them.
        </>
      )
    case VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown:
      return <>All of your locked tokens are currently in cooldown period.</>
  }
}

type LockedModalButtonProps = {
  currentVestingAccountState: VestingAccountState | undefined
  mainStakeAccount: MainStakeAccount
}
function LockedModalButton({
  currentVestingAccountState,
  mainStakeAccount,
}: LockedModalButtonProps) {
  const { data: stakeConnection } = useStakeConnection()

  const unvestedLockAll = useUnvestedLockAllMutation()
  const unvestedPreUnlockAll = useUnvestedPreUnlockAllMutation()
  const unvestedUnlockAll = useUnvestedUnlockAllMutation()

  if (mainStakeAccount === 'NA') return <></>

  switch (currentVestingAccountState) {
    case VestingAccountState.UnvestedTokensFullyLocked:
      return (
        <>
          <button
            type="button"
            className="primary-btn  px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
            onClick={() =>
              unvestedPreUnlockAll.mutate({
                mainStakeAccount: mainStakeAccount as StakeAccount,
                stakeConnection: stakeConnection!,
              })
            }
            disabled={
              mainStakeAccount === undefined || stakeConnection === undefined
            }
          >
            Preliminary unstake
          </button>
          <button
            type="button"
            className="primary-btn  px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
            onClick={() =>
              unvestedUnlockAll.mutate({
                mainStakeAccount: mainStakeAccount as StakeAccount,
                stakeConnection: stakeConnection!,
              })
            }
            disabled={
              mainStakeAccount === undefined || stakeConnection === undefined
            }
          >
            Unstake all
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
            onClick={() =>
              unvestedLockAll.mutate({
                mainStakeAccount: mainStakeAccount as StakeAccount,
                stakeConnection: stakeConnection!,
              })
            }
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
                content="Your tokens are in the process of being unlocked."
                className="m-4"
              >
                Stake all
              </Tooltip>
            ) : (
              'Stake all'
            )}
          </button>
          <button
            type="button"
            className="primary-btn min-w-[145px] px-8 py-3 text-base font-semibold  hover:bg-blueGemHover disabled:bg-valhalla"
            onClick={() =>
              unvestedUnlockAll.mutate({
                mainStakeAccount: mainStakeAccount as StakeAccount,
                stakeConnection: stakeConnection!,
              })
            }
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
                    ? "You don't have any locked tokens to unlock."
                    : 'Your tokens are in the process of being unlocked.'
                }
                className="m-4"
              >
                Unstake all
              </Tooltip>
            ) : (
              'Unstake all'
            )}
          </button>
        </>
      )
  }
}
