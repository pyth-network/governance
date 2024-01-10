import CloseIcon from '@components/icons/CloseIcon'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment, ReactNode } from 'react'

export type BaseModalProps = {
  isModalOpen: boolean
  setIsModalOpen: (open: boolean) => void
  title: string
  children: ReactNode
}

export function BaseModal({
  isModalOpen,
  setIsModalOpen,
  title,
  children,
}: BaseModalProps) {
  const closeModal = () => {
    setIsModalOpen(false)
  }

  return (
    <Transition appear show={isModalOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={closeModal}>
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
              <Dialog.Panel className="diaglogPanel ">
                <button className="diaglogClose" onClick={closeModal}>
                  <span className="mr-3">close</span> <CloseIcon />
                </button>
                <div className="max-w-md">
                  <Dialog.Title as="h3" className="diaglogTitle">
                    {title}
                  </Dialog.Title>
                  {children}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
