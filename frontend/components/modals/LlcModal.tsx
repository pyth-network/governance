import Spinner from '@components/Spinner'
import { BaseModal } from './BaseModal'
import CloseIcon from '@components/icons/CloseIcon'
import { Transition, Dialog } from '@headlessui/react'
import { title } from 'process'
import { Fragment } from 'react'

type LlcModalProps = {
  isLlcModalOpen: boolean
  setIsLlcModalOpen: (open: boolean) => void
  onSignLlc: () => void
  isSigning?: boolean
}
export function LlcModal({
  isSigning,
  isLlcModalOpen,
  setIsLlcModalOpen,
  onSignLlc,
}: LlcModalProps) {
  return (
    <>
      <Transition appear show={isLlcModalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-10"
          onClose={() => setIsLlcModalOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="diaglogPanel">
                  <button
                    className="diaglogClose"
                    onClick={() => setIsLlcModalOpen(false)}
                  >
                    <span className="mr-3">close</span> <CloseIcon />
                  </button>
                  <div className="">
                    <Dialog.Title
                      as="h1"
                      className="mx-auto max-w-xl px-6 py-6 text-center text-base18 font-semibold"
                    >
                      JOINDER AGREEMENT TO OPERATING AGREEMENT OF PYTH DAO LLC
                    </Dialog.Title>
                    <div className="scrollbar mx-auto mb-4 max-h-[50vh] max-w-xl pr-4 text-justify">
                      <p className="pb-3 leading-6 ">
                        This Joinder Agreement to the Operating Agreement (this
                        “<strong>Joinder</strong>”) is made and entered into as
                        of the date hereof (the “<strong>Effective Date</strong>
                        ”) by and between PYTH DAO LLC, a non-profit limited
                        liability company incorporated as per the laws of
                        Republic of the Marshall Islands (the “
                        <strong>Company</strong>”) and you (the “
                        <strong>Joining Party</strong>”). Capitalized terms used
                        but not defined in this Joinder shall have the
                        respective meanings ascribed to such terms in the
                        Operating Agreement (as defined below).
                      </p>
                      <h2 className="pb-3 pt-2 font-semibold">
                        The Joining Party acknowledges that:
                      </h2>
                      <p className="pb-3">
                        The Members of the Company have entered into that
                        certain Operating Agreement, dated as of [__] (the “
                        <strong>Operating Agreement</strong>”), a copy of which
                        is available at the following link: [___________].{' '}
                      </p>
                      <p className="pb-3">
                        The Joining Party desires to become a Member of the
                        Company, pursuant to the terms and conditions set forth
                        in the Operating Agreement.
                      </p>
                      <p className="pb-3">
                        Pursuant to the Article III of the Operating Agreement,
                        the Joining Party intends to acquire a Membership
                        Interest in the Company by staking PYTH SPL Tokens in
                        the Pyth Staking Program.
                      </p>
                      <p className="pb-3">
                        Pursuant to Article IX of the Operating Agreement, any
                        prospective member may become a Member automatically by
                        acquiring a Membership Interest as described in Article
                        III of the Operating Agreement and upon signing an
                        agreement (including electronically via their wallet
                        address) stating, among other things that they agree to
                        become a Member of the Company and be bound by the terms
                        of the Operating Agreement.
                      </p>
                      <h1 className="pb-6 text-center text-base18 font-semibold">
                        AGREEMENT
                      </h1>
                      <p className="pb-3">
                        NOW, THEREFORE, in consideration of the mutual covenants
                        and agreements herein contained, and other good and
                        valuable consideration, the receipt and sufficiency of
                        which are hereby acknowledged, the Joining Party and the
                        Company agree as follows:
                      </p>
                      <p className="pb-3">
                        <u>Joinder</u>. The Joining Party hereby agrees to (i)
                        become a Member, pursuant to Articles III and IX of the
                        Operating Agreement, and (ii) be bound by and adhere to
                        the terms and conditions of the Operating Agreement.
                      </p>
                      <p className="pb-3">
                        <u>Disclaimer</u>. The Joining Party has had the
                        opportunity to consult with its own tax adviser and
                        counsel to discuss and understand any tax and other
                        legal consequences of acquisition, ownership and
                        disposition of the Tokens, and any voting of their
                        Membership Interests.
                      </p>
                      <p className="pb-3">
                        <u>Representations and Warranties of Joining Party</u>.
                        The Joining Party hereby represents and warrants to
                        Company as follows:
                      </p>
                      <p className="pb-3">
                        <u>Authorization</u>. The Joining Party has full power
                        and authority and, with respect to any individual, the
                        capacity to enter into this Joinder. This Joinder when
                        executed and delivered by Joining Party, will constitute
                        valid and legally binding obligations of the Joining
                        Party, enforceable in accordance with its terms.
                      </p>
                      <p className="pb-3">
                        <u>Restricted Persons</u>. The Joining Party is not a
                        resident of Iran, Syria, Cuba, North Korea, or the
                        Crimea, Donetsk, or Luhansk regions of the Ukraine or
                        any other regions and jurisdictions, as updated per RMI
                        government guidelines and set forth in the Pyth
                        Governance Program.
                      </p>
                      <p className="pb-3">
                        <u>Miscellaneous.</u>
                      </p>
                      <p className="pb-3">
                        <u>Governing Law</u>. This Joinder is governed by and
                        shall be construed in accordance with the laws of the
                        Republic of the Marshall Islands without regard to the
                        conflicts of law principles thereof.
                      </p>
                      <p className="pb-3">
                        <u>Amendment</u>. Any provision of this Joinder may be
                        amended only by a written agreement executed by you and
                        the Company.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="primary-btn px-8 py-3 text-base font-semibold  hover:bg-blueGemHover"
                      onClick={onSignLlc}
                      disabled={isSigning}
                    >
                      {isSigning ? <Spinner /> : 'Sign LLC'}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
