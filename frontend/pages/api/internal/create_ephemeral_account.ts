import { STAKING_ADDRESS } from '@pythnetwork/staking/app/constants'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { Staking } from '@pythnetwork/staking/lib/target/types/staking'
import idl from '@pythnetwork/staking/target/idl/staking.json'
import { NextApiRequest, NextApiResponse } from 'next'
const POSITIONS_ACCOUNT_SIZE = 4040 // Can't use wasm in APIs

const wallet = new NodeWallet(
  Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.FUNDER_KEYPAIR!))
  )
)
const connection = new Connection(process.env.BACKEND_ENDPOINT!)
const provider = new AnchorProvider(
  connection,
  wallet,
  AnchorProvider.defaultOptions()
)
const stakingProgram = new Program<Staking>(
  idl as Staking,
  STAKING_ADDRESS,
  provider
)

export default async function handlerCreateEphemeralAccount(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const ephemeralAccountKeypair = new Keypair()
  const createAccountInstruction =
    await stakingProgram.account.positionData.createInstruction(
      ephemeralAccountKeypair,
      POSITIONS_ACCOUNT_SIZE
    )

  const tx = new Transaction().add(createAccountInstruction)
  await provider.sendAndConfirm(tx, [ephemeralAccountKeypair])

  res.status(200).json({ publicKey: ephemeralAccountKeypair.publicKey })
}
