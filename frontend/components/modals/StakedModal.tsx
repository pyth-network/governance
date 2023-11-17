import { PythBalance } from '@pythnetwork/staking'
import { BaseModal } from './BaseModal'

type StakedModalProps = {
  isStakedModalOpen: boolean
  setIsStakedModalOpen: (open: boolean) => void
  stakedPythBalance?: PythBalance
  stakingPythBalance?: PythBalance
}
export function StakedModal({
  isStakedModalOpen,
  setIsStakedModalOpen,
  stakedPythBalance,
  stakingPythBalance,
}: StakedModalProps) {
  return (
    <>
      <BaseModal
        isModalOpen={isStakedModalOpen}
        setIsModalOpen={setIsStakedModalOpen}
        title={'Staked tokens'}
      >
        <p className="mb-8 leading-6 ">
          Staked tokens enable you to participate in Pyth Network governance.
          Newly-staked tokens become eligible to vote in governance at the
          beginning of the next epoch.
        </p>
        <p className="leading-6 ">
          You currently have {stakedPythBalance?.toString()} staked tokens.
        </p>
        {stakingPythBalance && !stakingPythBalance.isZero() ? (
          <p className="mt-4 leading-6 ">
            {stakingPythBalance.toString()} tokens will be staked from the
            beginning of the next epoch.
          </p>
        ) : null}
      </BaseModal>
    </>
  )
}
