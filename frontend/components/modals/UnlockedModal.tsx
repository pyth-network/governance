import { PythBalance } from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'

export type UnlockedModalProps = {
  isUnlockedModalOpen: boolean
  setIsUnlockedModalOpen: (open: boolean) => void
  unlockedPythBalance?: PythBalance
  unlockingPythBalance?: PythBalance
}
export function UnlockedModal({
  isUnlockedModalOpen,
  setIsUnlockedModalOpen,
  unlockedPythBalance,
  unlockingPythBalance,
}: UnlockedModalProps) {
  return (
    <BaseModal
      isModalOpen={isUnlockedModalOpen}
      setIsModalOpen={setIsUnlockedModalOpen}
      title={'Unlocked Tokens'}
    >
      <p className="mb-6 leading-6">
        Unlocking tokens enables you to withdraw them from the program after a
        cooldown period of two epochs of which they become unlocked tokens.
        Unlocked tokens cannot participate in governance.
      </p>
      <p className="leading-6">
        You currently have {unlockedPythBalance?.toString()} unlocked tokens.
      </p>
      {unlockingPythBalance && !unlockingPythBalance.isZero() ? (
        <p className="mt-4 leading-6">
          {unlockingPythBalance.toString()} tokens have to go through a
          cool-down period for 2 epochs before they can be withdrawn.
        </p>
      ) : null}
    </BaseModal>
  )
}
