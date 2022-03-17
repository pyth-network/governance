import * as anchor from "@project-serum/anchor";
import { exec } from "child_process";
import { PublicKey, Connection, Keypair, Transaction, SystemProgram} from "@solana/web3.js";
import fs from "fs";
import { Program, Provider, Wallet } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { MintLayout } from "@solana/spl-token";
import shell from "shelljs";

export async function startValidator(portNumber: number, config: any) {
  const connection: Connection = new Connection(
    `http://localhost:${portNumber}`,
    Provider.defaultOptions().commitment
  );

  const controller: AbortController = new AbortController();
  const { signal } = controller;

  const ledgerDir = config.validator.ledger_dir;
  const programAddress = new PublicKey(config.programs.localnet.staking);
  const idlPath = config.build.idl_path;
  const binaryPath = config.build.binary_path;

  const user = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(config.provider.wallet).toString())
    )
  );

  exec(
    `mkdir -p ${ledgerDir}/${portNumber} && solana-test-validator --ledger ${ledgerDir}/${portNumber} --rpc-port ${portNumber} --mint ${
      user.publicKey
    } --reset --bpf-program  ${programAddress.toBase58()} ${binaryPath} --faucet-port ${portNumber+ 101}`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    }
  );

  while (true) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await connection.getEpochInfo();
      break;
    } catch (e) {}
  }

  const provider = new Provider(connection, new Wallet(user), {});
  const program: Program = new Program(
    JSON.parse(fs.readFileSync(idlPath).toString()),
    programAddress,
    provider
  );


  shell.exec(
    `anchor idl init -f ${idlPath} ${programAddress.toBase58()}  --provider.cluster ${`http://localhost:${portNumber}`}`
  );

  return { controller, program };
}

export async function requestPythAirdrop(
  destination: PublicKey,
  pythMintAccount: PublicKey,
  pythMintAuthority: Keypair,
  amount: number,
  connection: Connection
) {
  await connection.requestAirdrop(pythMintAuthority.publicKey, 1_000_000_000);

  const transaction = new Transaction();

  const destinationAta = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pythMintAccount,
    destination
  );

  if ((await connection.getAccountInfo(destinationAta)) == null) {
    const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount,
      destinationAta,
      destination,
      pythMintAuthority.publicKey
    );
    transaction.add(create_ata_ix);
  }

  const mint_ix = Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    pythMintAccount,
    destinationAta,
    pythMintAuthority.publicKey,
    [],
    amount
  );
  transaction.add(mint_ix);

  await connection.sendTransaction(transaction, [pythMintAuthority], {skipPreflight: true});
}

/**
 * Creates new spl-token at a random keypair
 */
 export async function createMint(
    provider: anchor.Provider,
    mintAccount: Keypair,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    decimals: number,
    programId: PublicKey
  ): Promise<void> {
    // Allocate memory for the account
    const balanceNeeded = await Token.getMinBalanceRentForExemptMint(
      provider.connection
    );
  
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mintAccount.publicKey,
        lamports: balanceNeeded,
        space: MintLayout.span,
        programId,
      })
    );
  
    transaction.add(
      Token.createInitMintInstruction(
        programId,
        mintAccount.publicKey,
        decimals,
        mintAuthority,
        freezeAuthority
      )
    );
  
    // Send the two instructions
    const tx = await provider.send(transaction, [mintAccount], {
      skipPreflight: true,
    });
  }