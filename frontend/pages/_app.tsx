import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react'
import { ChakraProvider } from '@chakra-ui/react'
import { MainWalletBase } from '@cosmos-kit/core'
import { wallets as cosmostationWallets } from '@cosmos-kit/cosmostation'
import { wallets as keplrWallets } from '@cosmos-kit/keplr'
import { wallets as leapWallets } from '@cosmos-kit/leap'
import { ChainProvider, noCssResetTheme } from '@cosmos-kit/react'
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
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { assets, chains } from 'chain-registry'
import { ConnectKitProvider, getDefaultConfig } from 'connectkit'
import type { AppProps } from 'next/app'
import { PetraWallet } from 'petra-plugin-wallet-adapter'
import { FC, useMemo } from 'react'

import { WalletProvider as SuiWalletProvider } from '@suiet/wallet-kit'
import '@suiet/wallet-kit/style.css'
import { Toaster } from 'react-hot-toast'
import { WagmiConfig, createConfig } from 'wagmi'

// Use require instead of import since order matters
require('@solana/wallet-adapter-react-ui/styles.css')
require('../styles/globals.css')
require('@aptos-labs/wallet-adapter-ant-design/dist/index.css')

const config = createConfig(
  getDefaultConfig({
    alchemyId: process.env.NEXT_PUBLIC_ALCHEMY_KEY,
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    appName: 'Pyth Network',
    appIcon: 'https://pyth.network/social-logo.png',
    autoConnect: false,
  })
)

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
    ],
    []
  )

  const aptosWallets = useMemo(() => [new PetraWallet()], [])

  return (
    <ConnectionProvider
      endpoint={endpoint || clusterApiUrl(WalletAdapterNetwork.Devnet)}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AptosWalletAdapterProvider plugins={aptosWallets}>
            <WagmiConfig config={config}>
              <ConnectKitProvider>
                <ChakraProvider theme={noCssResetTheme}>
                  <ChainProvider
                    chains={chains}
                    assetLists={assets}
                    wallets={
                      [
                        ...keplrWallets,
                        ...cosmostationWallets,
                        ...leapWallets,
                      ] as unknown as MainWalletBase[]
                    }
                    walletConnectOptions={{
                      signClient: {
                        projectId:
                          process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
                        relayUrl: 'wss://relay.walletconnect.org',
                        metadata: {
                          name: 'Pyth Network',
                          description: 'Pyth Network',
                          url: 'https://pyth.network/',
                          icons: [],
                        },
                      },
                    }}
                    wrappedWithChakra={true}
                  >
                    <SuiWalletProvider>
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
                    </SuiWalletProvider>
                  </ChainProvider>
                </ChakraProvider>
              </ConnectKitProvider>
            </WagmiConfig>
          </AptosWalletAdapterProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

export default App
