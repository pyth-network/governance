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
        cooldown period of one epoch once the current epoch ends. (Epochs start
        every Thursday at 00:00 UTC). Unstaked tokens cannot participate in
        governance.
      </p>
      <p className="leading-6">
        You currently have {unstakedPythBalance?.toString()} unstaked tokens.
      </p>
      {unstakingPythBalance && !unstakingPythBalance.isZero() ? (
        <p className="mt-4 leading-6">
          {unstakingPythBalance.toString()} tokens have to go through a cooldown
          period for one full epoch before they can be withdrawn.
        </p>
      ) : null}
    </BaseModal>
  )
}
