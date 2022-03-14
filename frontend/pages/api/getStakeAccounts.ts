import { AUTHORITY_SEED, STAKING_PROGRAM } from '@components/constants'
import { Provider, Program, Idl, Wallet, utils } from '@project-serum/anchor'
import { AnchorWallet } from '@solana/wallet-adapter-react'
import { Connection, PublicKey } from '@solana/web3.js'

export const getStakeAccounts = async (
  connection: Connection,
  anchorWallet: AnchorWallet | undefined,
  publicKey: PublicKey
) => {
  const provider = new Provider(connection, anchorWallet as Wallet, {
    preflightCommitment: 'recent',
  })
  const idl = await Program.fetchIdl(STAKING_PROGRAM, provider)
  const program = new Program(idl as Idl, STAKING_PROGRAM, provider)
  const stakeAccounts = await provider.connection.getProgramAccounts(
    program.programId,
    {
      encoding: 'base64',
      filters: [
        {
          memcmp: {
            offset: 12,
            bytes: publicKey.toBase58(),
          },
        },
      ],
    }
  )
  return stakeAccounts
}
