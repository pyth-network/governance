import { BaseModal } from './BaseModal'

type LLCModalProps = {
  isLLCModalOpen: boolean
  setIsLLCModalOpen: (open: boolean) => void
  onSignLLC: () => void
}
export function LLCModal({
  isLLCModalOpen,
  setIsLLCModalOpen,
  onSignLLC,
}: LLCModalProps) {
  return (
    <>
      <BaseModal
        isModalOpen={isLLCModalOpen}
        setIsModalOpen={setIsLLCModalOpen}
        title={'Sign LLC'}
      >
        <p className="mb-8 leading-6 ">
          {/* TODO: update the copy of this */}
          Staked tokens enable you to participate in Pyth Network governance.
          Newly-staked tokens become eligible to vote in governance at the
          beginning of the next epoch. (Epochs start every Thursday at 00:00
          UTC).
        </p>

        <button
          type="button"
          className="primary-btn  px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
          onClick={() => {
            onSignLLC()
            setIsLLCModalOpen(false)
          }}
        >
          Sign LLC
        </button>
      </BaseModal>
    </>
  )
}
