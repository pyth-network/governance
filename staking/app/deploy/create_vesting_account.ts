import { Wallet, AnchorProvider, Program, utils } from "@project-serum/anchor";
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Keypair,
} from "@solana/web3.js";
import {
  AUTHORITY_KEYPAIR,
  PYTH_TOKEN,
  STAKING_PROGRAM,
  RPC_NODE,
} from "./devnet";
import * as wasm from "pyth-staking-wasm";
import { BN } from "bn.js";
import { PythBalance } from "../pythBalance";
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";

async function main() {
  const client = new Connection(RPC_NODE);
  const provider = new AnchorProvider(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    {}
  );
  const recipient = new PublicKey(
    "HBefNAynXjS9nnXiPD7vZXHM4PRNgUKL7ABE5ADxvnEi"
  );
  const idl = (await Program.fetchIdl(STAKING_PROGRAM, provider))!;
  const program = new Program(idl, STAKING_PROGRAM, provider);

  const clockBuf = await program.provider.connection.getAccountInfo(
    SYSVAR_CLOCK_PUBKEY
  );
  const time = new BN(wasm.getUnixTime(clockBuf!.data).toString());

  const vestingSchedule = {
    periodicVesting: {
      initialBalance: PythBalance.fromString("100").toBN(),
      startDate: time,
      periodDuration: new BN(3600),
      numPeriods: new BN(1000),
    },
  };

  const stakeAccountKeypair = new Keypair();

  const ix = await program.account.positionData.createInstruction(
    stakeAccountKeypair,
    wasm.Constants.POSITIONS_ACCOUNT_SIZE()
  );

  const fromAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    PYTH_TOKEN,
    AUTHORITY_KEYPAIR.publicKey
  );

  const toAccount = (
    await PublicKey.findProgramAddress(
      [
        utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
        stakeAccountKeypair.publicKey.toBuffer(),
      ],
      program.programId
    )
  )[0];

  const ix2 = Token.createTransferInstruction(
    TOKEN_PROGRAM_ID,
    fromAccount,
    toAccount,
    AUTHORITY_KEYPAIR.publicKey,
    [],
    new u64(PythBalance.fromString("100").toBN().toString())
  );

  await program.methods
    .createStakeAccount(recipient, vestingSchedule)
    .accounts({
      stakeAccountPositions: stakeAccountKeypair.publicKey,
      mint: PYTH_TOKEN,
    })
    .preInstructions([ix])
    .postInstructions([ix2])
    .signers([stakeAccountKeypair])
    .rpc();
}

main();
