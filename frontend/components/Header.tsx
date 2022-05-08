import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Dialog } from '@headlessui/react'
import { useState } from 'react'
import { classNames } from 'utils/classNames'

const Header = () => {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="mb-3 grid grid-cols-12">
      <div className="col-span-12 flex h-24 items-center justify-between px-8 md:px-8 xl:col-span-10 xl:col-start-2">
        <div className="flex cursor-pointer items-center md:w-36">
          <Link href="/staking">
            <img src="/pyth-logo-white.svg" className="h-30 mr-3" />
          </Link>
        </div>
        <div className="hidden space-x-20 md:flex">
          <Link href="/staking">
            <a
              className={
                router.pathname == '/staking' ? 'nav-link-active' : 'nav-link'
              }
            >
              Staking
            </a>
          </Link>
          <Link
            href={`https://realms.today/dao/PYTH?cluster=${
              process.env.ENDPOINT?.startsWith('http://localhost:')
                ? 'localnet'
                : 'devnet'
            }`}
          >
            <a
              className={
                router.pathname == '/governance'
                  ? 'nav-link-active'
                  : 'nav-link'
              }
            >
              <div className="flex">
                Governance{' '}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="my-auto ml-1 h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </div>
            </a>
          </Link>
        </div>
        <div className="flex items-center justify-end space-x-2">
          <WalletMultiButton className="primary-btn" />
          <div className="md:hidden">
            <button
              className="rounded-full p-2 hover:bg-hoverGray"
              onClick={() => setIsMenuOpen(true)}
            >
              <img
                src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjIiIGhlaWdodD0iMzMiIHZpZXdCb3g9IjAgMCAyMiAzMyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxsaW5lIHgxPSIxMSIgeTE9IjEuNSIgeDI9IjExIiB5Mj0iMzEuNSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPg0KPGxpbmUgeDE9IjEuNSIgeTE9IjExLjUiIHgyPSIxLjUiIHkyPSIyNS41IiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+DQo8bGluZSB4MT0iMjAuNSIgeTE9IjUuNjI1IiB4Mj0iMjAuNSIgeTI9IjIwLjE1NjIiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4NCjwvc3ZnPg0K"
                alt="open nav"
                className="w-8"
              />
            </button>
          </div>
        </div>
      </div>
      <Dialog open={isMenuOpen} onClose={() => setIsMenuOpen(false)}>
        <div className="flex min-h-screen justify-center">
          <Dialog.Overlay className="fixed inset-0 bg-black" />
          <div className="height-screen fixed top-0 mx-auto w-full rounded py-6 px-8">
            <div className="flex items-center justify-end space-x-2">
              <button
                className="rounded-full p-2 hover:bg-hoverGray"
                onClick={() => setIsMenuOpen(false)}
              >
                <img
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjciIGhlaWdodD0iMjciIHZpZXdCb3g9IjAgMCAyNyAyNyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxsaW5lIHgxPSIyLjk1NDA4IiB5MT0iMi44MzI3NiIgeDI9IjI0LjE2NzMiIHkyPSIyNC4wNDYiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+DQo8bGluZSB4MT0iMTIuMDIwOCIgeTE9IjE0LjEyMTMiIHgyPSIyLjEyMTI2IiB5Mj0iMjQuMDIwOCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4NCjxsaW5lIHgxPSIyNC4zOTY1IiB5MT0iMi4xMjEzMiIgeDI9IjE0LjEyMTMiIHkyPSIxMi4zOTY1IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPg0KPC9zdmc+DQo="
                  alt="close nav"
                  className="w-8"
                />
              </button>
            </div>
            <div className="griw-rows-2 grid space-y-8 text-center">
              <Link href="/staking">
                <a
                  className={classNames(
                    'font-arboria text-4xl',
                    router.pathname == '/staking' ? 'text-pink' : 'text-white'
                  )}
                >
                  Staking
                </a>
              </Link>
              <Link
                href={`https://realms.today/dao/PYTH?cluster=${
                  process.env.ENDPOINT?.startsWith('http://localhost:')
                    ? 'localnet'
                    : 'devnet'
                }`}
              >
                <a
                  className={classNames(
                    'font-arboria text-4xl',
                    router.pathname == '/governance'
                      ? 'text-pink'
                      : 'text-white'
                  )}
                >
                  <div className="flex justify-center">
                    <div className="my-auto">Governance</div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mt-auto mb-1 ml-1 h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </div>
                </a>
              </Link>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default Header
