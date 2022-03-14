import {
  STAKING_PROGRAM,
  STAKE_ACCOUNT_METADATA_SEED,
  POSITIONS_ACCOUNT_SIZE,
  PYTH_MINT_ACCOUNT,
  CUSTODY_SEED,
} from '@components/constants'
import { Provider, Program, Idl, Wallet, utils } from '@project-serum/anchor'
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { AnchorWallet } from '@solana/wallet-adapter-react'
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import { findAssociatedTokenAddress } from './findAssociatedTokenAddress'
import { getStakeAccounts } from './getStakeAccounts'

export const depositTokens = async (
  connection: Connection,
  anchorWallet: AnchorWallet | undefined,
  publicKey: PublicKey,
  amount: number
) => {
  const provider = new Provider(connection, anchorWallet as Wallet, {
    preflightCommitment: 'recent',
  })
  const idl = await Program.fetchIdl(STAKING_PROGRAM, provider)
  const program = new Program(idl as Idl, STAKING_PROGRAM, provider)
  const transaction = new Transaction()

  const stakeAccounts = await getStakeAccounts(
    connection,
    anchorWallet,
    publicKey
  )

  const toAccount = (
    await PublicKey.findProgramAddress(
      [
        utils.bytes.utf8.encode(CUSTODY_SEED),
        stakeAccounts[0].pubkey.toBuffer(),
      ],
      program.programId
    )
  )[0]

  const ata = await findAssociatedTokenAddress(publicKey, PYTH_MINT_ACCOUNT)

  const ix = Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    ata,
    toAccount,
    publicKey,
    [],
    amount
  )
  transaction.add(ix)
  const tx = await provider.send(transaction)

  const stake_account_metadata_data =
    await program.account.stakeAccountMetadata.fetch(toAccount)
  return stake_account_metadata_data
}
