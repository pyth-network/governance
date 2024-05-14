import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  BackpackWalletAdapter,
  GlowWalletAdapter,
  LedgerWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  SolletExtensionWalletAdapter,
  SolletWalletAdapter,
  TorusWalletAdapter,
  WalletConnectWalletAdapter,
  WalletConnectWalletAdapterConfig,
} from '@solana/wallet-adapter-wallets'
import type { AppProps } from 'next/app'
import { FC, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from 'react-query'

import { Toaster } from 'react-hot-toast'

// Use require instead of import since order matters
require('@solana/wallet-adapter-react-ui/styles.css')
require('../styles/globals.css')

const walletConnectConfig: WalletConnectWalletAdapterConfig = {
  network:
    process.env.CLUSTER === 'devnet'
      ? WalletAdapterNetwork.Devnet
      : WalletAdapterNetwork.Mainnet,
  options: {
    relayUrl: 'wss://relay.walletconnect.com',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    metadata: {
      name: 'Pyth Staking',
      description: 'Stake your PYTH tokens to participate in governance',
      url: 'https://staking.pyth.network/',
      icons: ['https://pyth.network/token.svg'],
    },
  },
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 60 * 1000, // won't stale for an hour
      cacheTime: 2 * 60 * 60 * 1000, // cache won't be cleared for 2 hours
      refetchOnWindowFocus: false,
    },
  },
})

const App: FC<AppProps> = ({ Component, pageProps }: AppProps) => {
  // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
  // const network = WalletAdapterNetwork.Devnet

  // You can also provide a custom RPC endpoint
  // const endpoint = useMemo(() => clusterApiUrl(network), [network])

  const endpoint = process.env.ENDPOINT
  // @solana/wallet-adapter-wallets includes all the adapters but supports tree shaking and lazy loading --
  // Only the wallets you configure here will be compiled into your application, and only the dependencies
  // of wallets that your users connect to will be loaded
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new GlowWalletAdapter(),
      new BackpackWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
      new SolletWalletAdapter(),
      new SolletExtensionWalletAdapter(),
      new WalletConnectWalletAdapter(walletConnectConfig),
    ],
    []
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint || 'http://localhost:8899'}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <Component {...pageProps} />
            <Toaster
              position="bottom-left"
              toastOptions={{
                style: {
                  wordBreak: 'break-word',
                },
              }}
              reverseOrder={false}
            />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  )
}

export default App
