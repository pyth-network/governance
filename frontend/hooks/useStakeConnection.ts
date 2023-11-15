import { Wallet } from '@project-serum/anchor'
import { STAKING_ADDRESS, StakeConnection } from '@pythnetwork/staking'
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react'
import toast from 'react-hot-toast'
import { useQuery } from 'react-query'
import { capitalizeFirstLetter } from 'utils/capitalizeFirstLetter'

export function useStakeConnection() {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()

  return useQuery(
    ['create-stake-connection', anchorWallet?.publicKey.toString()],
    async () => {
      if (anchorWallet === undefined) return undefined

      return await StakeConnection.createStakeConnection(
        connection,
        anchorWallet as Wallet,
        STAKING_ADDRESS
      )
    },
    {
      onError(err: Error) {
        toast.error(capitalizeFirstLetter(err.message))
      },
    }
  )
}
