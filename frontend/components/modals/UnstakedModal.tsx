import { PythBalance } from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'

export type UnstakedModalProps = {
  isUnstakedModalOpen: boolean
  setIsUnstakedModalOpen: (open: boolean) => void
  unlockedPythBalance?: PythBalance
  unlockingPythBalance?: PythBalance
}
export function UnstakedModal({
  isUnstakedModalOpen,
  setIsUnstakedModalOpen,
  unlockedPythBalance,
  unlockingPythBalance,
}: UnstakedModalProps) {
  return (
    <BaseModal
      isModalOpen={isUnstakedModalOpen}
      setIsModalOpen={setIsUnstakedModalOpen}
      title={'Unstaked Tokens'}
    >
      <p className="mb-6 leading-6">
        Unstaking tokens enables you to withdraw them from the program after a
        cooldown period of two epochs of which they become unstaked tokens.
        Unstaked tokens cannot participate in governance.
      </p>
      <p className="leading-6">
        You currently have {unlockedPythBalance?.toString()} unstaked tokens.
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
