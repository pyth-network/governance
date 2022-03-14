import {
  STAKING_PROGRAM,
  STAKE_ACCOUNT_METADATA_SEED,
  POSITIONS_ACCOUNT_SIZE,
  PYTH_MINT_ACCOUNT,
} from '@components/constants'
import { Provider, Program, Idl, Wallet, utils } from '@project-serum/anchor'
import { AnchorWallet } from '@solana/wallet-adapter-react'
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'

export const createStakeAccount = async (
  connection: Connection,
  anchorWallet: AnchorWallet | undefined
) => {
  const provider = new Provider(connection, anchorWallet as Wallet, {
    preflightCommitment: 'recent',
  })
  const idl = await Program.fetchIdl(STAKING_PROGRAM, provider)
  const program = new Program(idl as Idl, STAKING_PROGRAM, provider)
  const owner = provider.wallet.publicKey
  const stakeAccountPositionsSecret = new Keypair()

  const [metadataAccount] = await PublicKey.findProgramAddress(
    [
      utils.bytes.utf8.encode(STAKE_ACCOUNT_METADATA_SEED),
      stakeAccountPositionsSecret.publicKey.toBuffer(),
    ],
    program.programId
  )

  const tx = await program.methods
    .createStakeAccount(owner, { fullyVested: {} })
    .preInstructions([
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: stakeAccountPositionsSecret.publicKey,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(
          POSITIONS_ACCOUNT_SIZE
        ),
        space: POSITIONS_ACCOUNT_SIZE,
        programId: program.programId,
      }),
    ])
    .accounts({
      stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      mint: PYTH_MINT_ACCOUNT,
    })
    .signers([stakeAccountPositionsSecret])
    .rpc({
      skipPreflight: false,
    })

  const stake_account_metadata_data =
    await program.account.stakeAccountMetadata.fetch(metadataAccount)
  return stake_account_metadata_data
}
