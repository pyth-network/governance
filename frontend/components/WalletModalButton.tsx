import { WalletModalButton as SolanaWalletModalButton } from '@solana/wallet-adapter-react-ui'

export function WalletModalButton() {
  return (
    <SolanaWalletModalButton
      style={{
        padding: '0 64px',
        border: 'solid',
        borderWidth: '1px',
        borderColor: 'rgb(113 66 207)',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
        background: 'rgb(113 66 207)',
        height: '45px',
      }}
    />
  )
}
