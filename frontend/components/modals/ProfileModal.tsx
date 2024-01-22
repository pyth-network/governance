import Link from 'next/link'
import { BaseModal } from './BaseModal'

export type ProfileModalProps = {
  isProfileModalOpen: boolean
  setIsProfileModalOpen: (open: boolean) => void
}
export function ProfileModal({
  isProfileModalOpen,
  setIsProfileModalOpen,
}: ProfileModalProps) {
  return (
    <BaseModal
      isModalOpen={isProfileModalOpen}
      setIsModalOpen={setIsProfileModalOpen}
      title={'Pyth Profile'}
    >
      <p className="mb-6 leading-6">
        $PYTH stakers and governance participants can now map their EVM wallet
        addresses to their Solana (SPL) addresses.
      </p>{' '}
      <p className="mb-6 leading-6">
        Click{' '}
        <Link href={'/profile'}>
          <a className="font-bold">here</a>
        </Link>{' '}
        to set up your Pyth Profile.
      </p>
    </BaseModal>
  )
}
