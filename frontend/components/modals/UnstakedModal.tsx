import { PythBalance } from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'

export type UnstakedModalProps = {
  isUnstakedModalOpen: boolean
  setIsUnstakedModalOpen: (open: boolean) => void
  unstakedPythBalance?: PythBalance
  unstakingPythBalance?: PythBalance
}
export function UnstakedModal({
  isUnstakedModalOpen,
  setIsUnstakedModalOpen,
  unstakedPythBalance,
  unstakingPythBalance,
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
        You currently have {unstakedPythBalance?.toString()} unstaked tokens.
      </p>
      {unstakingPythBalance && !unstakingPythBalance.isZero() ? (
        <p className="mt-4 leading-6">
          {unstakingPythBalance.toString()} tokens have to go through a
          cool-down period for 2 epochs before they can be withdrawn.
        </p>
      ) : null}
    </BaseModal>
  )
}
