import Head from 'next/head'
import type { AppProps } from 'next/app'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  GlowWalletAdapter,
  LedgerWalletAdapter,
  PhantomWalletAdapter,
  SlopeWalletAdapter,
  SolflareWalletAdapter,
  SolletExtensionWalletAdapter,
  SolletWalletAdapter,
  TorusWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { Toaster } from 'react-hot-toast'
import { FC, useMemo } from 'react'
import Footer from '@components/Footer'

// Use require instead of import since order matters
require('@solana/wallet-adapter-react-ui/styles.css')
require('../styles/globals.css')

const App: FC<AppProps> = ({ Component, pageProps }: AppProps) => {
  // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
  // const network = WalletAdapterNetwork.Devnet

  // You can also provide a custom RPC endpoint
  // const endpoint = useMemo(() => clusterApiUrl(network), [network])

  const endpoint =
    process.env.ENDPOINT && process.env.ENDPOINT === 'devnet'
      ? clusterApiUrl(WalletAdapterNetwork.Devnet)
      : process.env.ENDPOINT

  // @solana/wallet-adapter-wallets includes all the adapters but supports tree shaking and lazy loading --
  // Only the wallets you configure here will be compiled into your application, and only the dependencies
  // of wallets that your users connect to will be loaded
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new GlowWalletAdapter(),
      new SlopeWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
      new SolletWalletAdapter(),
      new SolletExtensionWalletAdapter(),
    ],
    []
  )

  return (
    <ConnectionProvider
      endpoint={endpoint || clusterApiUrl(WalletAdapterNetwork.Devnet)}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Component {...pageProps} />
          <Toaster
            position="bottom-left"
            toastOptions={{
              style: {
                wordBreak: 'break-all',
              },
            }}
            reverseOrder={false}
          />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

;(function () {
  import('../../staking/wasm/bundle/staking_bg.wasm')
  // Import which .wasm files you need here
})

export default App
