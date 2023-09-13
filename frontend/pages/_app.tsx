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

import { Toaster } from 'react-hot-toast'

// Use require instead of import since order matters
require('@solana/wallet-adapter-react-ui/styles.css')
require('../styles/globals.css')

const walletConnectConfig : WalletConnectWalletAdapterConfig = {
  network :  WalletAdapterNetwork.Devnet,
  options : {
    relayUrl : 'wss://relay.walletconnect.com',
    projectId : process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    metadata: {
      name: 'Example App',
      description: 'Example App',
      url: 'https://github.com/solana-labs/wallet-adapter',
      icons: ['https://avatars.githubusercontent.com/u/35608259?s=200'],
  },
  } 
} // TO DO : add options

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
      new WalletConnectWalletAdapter(walletConnectConfig)
    ],
    []
  )

  return (
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
  )
}

export default App
