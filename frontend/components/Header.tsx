import { Dialog } from '@headlessui/react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
)

const Header = () => {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <div className="before:gradient-border relative -bottom-[1px]  mb-3">
      <div className="col-span-12 flex h-24 items-center justify-between px-8 md:px-8 xl:col-span-10 xl:col-start-2">
        <div className="flex basis-[160px] cursor-pointer items-center">
          <Link href="/staking">
            <img src="/pyth-logo-white.svg" className="h-30 mr-3" />
          </Link>
        </div>
        <div className="hidden space-x-10 md:flex">
          <Link href="/staking">
            <a
              className={
                router.pathname == '/staking'
                  ? 'nav-link font-bold'
                  : 'nav-link '
              }
            >
              Staking
            </a>
          </Link>
          <Link
            href={`https://realms.today/dao/PYTH${
              process.env.CLUSTER !== 'mainnet'
                ? '?cluster=' + process.env.CLUSTER
                : ''
            }`}
          >
            <a className="nav-link">Governance</a>
          </Link>
          <Link href="https://pyth.network">
            <a className="nav-link">Pyth Network</a>
          </Link>
        </div>
        <div className="flex items-center justify-end space-x-2">
          <div className="flex w-[200px] justify-end">
            <WalletMultiButtonDynamic className="primary-btn pt-0.5" />
          </div>
          <div className="flex-shrink-0 md:hidden">
            <button
              className="rounded-full p-2 hover:bg-hoverGray"
              onClick={() => setIsMenuOpen(true)}
            >
              <img
                src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjIiIGhlaWdodD0iMzMiIHZpZXdCb3g9IjAgMCAyMiAzMyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxsaW5lIHgxPSIxMSIgeTE9IjEuNSIgeDI9IjExIiB5Mj0iMzEuNSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPg0KPGxpbmUgeDE9IjEuNSIgeTE9IjExLjUiIHgyPSIxLjUiIHkyPSIyNS41IiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+DQo8bGluZSB4MT0iMjAuNSIgeTE9IjUuNjI1IiB4Mj0iMjAuNSIgeTI9IjIwLjE1NjIiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4NCjwvc3ZnPg0K"
                alt="open nav"
                className="w-5"
              />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={isMenuOpen} onClose={() => setIsMenuOpen(false)}>
        <div className="flex min-h-screen justify-center">
          <Dialog.Overlay className="fixed inset-0 bg-dark" />
          <div className="height-screen fixed  top-0 mx-auto w-full rounded px-8 py-6">
            <div className="flex items-center justify-between space-x-2 pt-[7px]">
              <Link href="/staking">
                <img src="/pyth-logo-white.svg" className="h-30 mr-3" />
              </Link>
              <button
                className="rounded-full p-2 hover:bg-hoverGray"
                onClick={() => setIsMenuOpen(false)}
              >
                <img
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjciIGhlaWdodD0iMjciIHZpZXdCb3g9IjAgMCAyNyAyNyIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4NCjxsaW5lIHgxPSIyLjk1NDA4IiB5MT0iMi44MzI3NiIgeDI9IjI0LjE2NzMiIHkyPSIyNC4wNDYiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+DQo8bGluZSB4MT0iMTIuMDIwOCIgeTE9IjE0LjEyMTMiIHgyPSIyLjEyMTI2IiB5Mj0iMjQuMDIwOCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4NCjxsaW5lIHgxPSIyNC4zOTY1IiB5MT0iMi4xMjEzMiIgeDI9IjE0LjEyMTMiIHkyPSIxMi4zOTY1IiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPg0KPC9zdmc+DQo="
                  alt="close nav"
                  className="w-5"
                />
              </button>
            </div>
            <div className="griw-rows-2 grid space-y-5 pt-10 text-center text-base18">
              <Link href="/staking">
                <a>Staking</a>
              </Link>
              <Link
                href={`https://realms.today/dao/PYTH${
                  process.env.CLUSTER !== 'mainnet'
                    ? '?cluster=' + process.env.CLUSTER
                    : ''
                }`}
              >
                <a>
                  <div className="flex justify-center">Governance</div>
                </a>
              </Link>
              <Link href="https://pyth.network">
                <a>
                  <div className="flex justify-center">Pyth Network</div>
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
