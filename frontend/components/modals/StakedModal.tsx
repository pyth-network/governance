import { PythBalance } from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'

type StakedModalProps = {
  isStakedModalOpen: boolean
  setIsStakedModalOpen: (open: boolean) => void
  lockedPythBalance?: PythBalance
  lockingPythBalance?: PythBalance
}
export function StakedModal({
  isStakedModalOpen,
  setIsStakedModalOpen,
  lockedPythBalance,
  lockingPythBalance,
}: StakedModalProps) {
  return (
    <>
      <BaseModal
        isModalOpen={isStakedModalOpen}
        setIsModalOpen={setIsStakedModalOpen}
        title={'Staked tokens'}
      >
        <p className="mb-8 leading-6 ">
          Staked tokens enables you to participate in Pyth Network governance.
          Newly-staked tokens become eligible to vote in governance at the
          beginning of the next epoch.
        </p>
        <p className="leading-6 ">
          You currently have {lockedPythBalance?.toString()} staked tokens.
        </p>
        {lockingPythBalance && !lockingPythBalance.isZero() ? (
          <p className="mt-4 leading-6 ">
            {lockingPythBalance.toString()} tokens will be staked from the
            beginning of the next epoch.
          </p>
        ) : null}
      </BaseModal>
    </>
  )
}
