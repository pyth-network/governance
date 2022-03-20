import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import Link from 'next/link'
import { useRouter } from 'next/router'

const Header = () => {
  const router = useRouter()
  return (
    <div className="mb-3 grid grid-cols-12 bg-black">
      <div className="col-span-12 flex h-24 items-center justify-between px-4 md:px-8 xl:col-span-10 xl:col-start-2 xl:px-4">
        <div className="flex cursor-pointer items-center">
          <Link href="/">
            <img src="/pyth-logo-white.svg" className="h-30 mr-3" />
          </Link>
        </div>
        <div className="flex space-x-20">
          <Link href="/governance">
            <a
              className={
                router.pathname == '/governance'
                  ? 'nav-link-active'
                  : 'nav-link'
              }
            >
              Governance
            </a>
          </Link>
          <Link href="/staking">
            <a
              className={
                router.pathname == '/staking' ? 'nav-link-active' : 'nav-link'
              }
            >
              Staking
            </a>
          </Link>
        </div>
        <WalletMultiButton className="primary-btn" />
      </div>
    </div>
  )
}

export default Header
