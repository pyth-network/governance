import { PythBalance } from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'

type LockedModalProps = {
  isLockedModalOpen: boolean
  setIsLockedModalOpen: (open: boolean) => void
  lockedPythBalance?: PythBalance
  lockingPythBalance?: PythBalance
}
export function LockedModal({
  isLockedModalOpen,
  setIsLockedModalOpen,
  lockedPythBalance,
  lockingPythBalance,
}: LockedModalProps) {
  return (
    <>
      <BaseModal
        isModalOpen={isLockedModalOpen}
        setIsModalOpen={setIsLockedModalOpen}
        title={'Locked tokens'}
      >
        <p className="mb-8 leading-6 ">
          Locked tokens enables you to participate in Pyth Network governance.
          Newly-locked tokens become eligible to vote in governance at the
          beginning of the next epoch.
        </p>
        <p className="leading-6 ">
          You currently have {lockedPythBalance?.toString()} locked tokens.
        </p>
        {lockingPythBalance && !lockingPythBalance.isZero() ? (
          <p className="mt-4 leading-6 ">
            {lockingPythBalance.toString()} tokens will be locked from the
            beginning of the next epoch.
          </p>
        ) : null}
      </BaseModal>
    </>
  )
}
