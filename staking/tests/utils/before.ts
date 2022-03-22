import { exec } from "child_process";
import { mkdtemp } from "fs/promises";
import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import fs from "fs";
import { Program, Provider, Wallet, utils } from "@project-serum/anchor";
import * as wasm from "../../wasm/node/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { MintLayout } from "@solana/spl-token";
import shell from "shelljs";
import BN from "bn.js";
import toml from "toml";
import path from "path";
import os from "os";
import { StakeConnection } from "../../app";

export const ANCHOR_CONFIG_PATH = "./Anchor.toml";
interface AnchorConfig {
  path: {
    idl_path: string;
    binary_path: string;
  };
  provider: {
    cluster: string;
    wallet: string;
  };
  programs: {
    localnet: {
      staking: PublicKey;
    };
  };
  validator: {
    port: number;
    ledger_dir: string;
  };
}

export function readAnchorConfig(pathToAnchorToml: string) {
  const config: AnchorConfig = toml.parse(
    fs.readFileSync(pathToAnchorToml).toString()
  );

  return config;
}

/**
 * Deterministically determines the port for deploying the validator basing of the index of the testfile in the sorted
 * list of all testsfiles.
 * Two ports are needed (one for RPC and another one for websocket)
 */
export function getPortNumber(filename: string) {
  const index = fs.readdirSync("./tests/").sort().indexOf(filename);
  const portNumber = 8899 + 2 * index;
  return portNumber;
}
/**
 * Starts a validator at port portNumber with the staking program deployed the address defined in lib.rs.
 * Also takes config as an argument, config is obtained by parsing Anchor.toml
 *
 * ```const config = readAnchorConfig(ANCHOR_CONFIG_PATH)```
 *
 * returns a `{controller, program}` struct. Users of this method have to terminate the
 * validator by calling :
 * ```controller.abort()```
 */
export async function startValidator(portNumber: number, config: any) {
  const connection: Connection = getConnection(portNumber);

  const controller: AbortController = new AbortController();
  const { signal } = controller;

  const ledgerDir = await mkdtemp(path.join(os.tmpdir(), "ledger-"));
  const programAddress = new PublicKey(config.programs.localnet.staking);
  const idlPath = config.path.idl_path;
  const binaryPath = config.path.binary_path;

  const user = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(config.provider.wallet).toString())
    )
  );

  exec(
    `solana-test-validator --ledger ${ledgerDir} --rpc-port ${portNumber} --mint ${
      user.publicKey
    } --reset --bpf-program  ${programAddress.toBase58()} ${binaryPath} --faucet-port ${
      portNumber + 101
    }`,
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
  const program = new Program(
    JSON.parse(fs.readFileSync(idlPath).toString()),
    programAddress,
    provider
  );

  shell.exec(
    `anchor idl init -f ${idlPath} ${programAddress.toBase58()}  --provider.cluster ${`http://localhost:${portNumber}`}`
  );

  return { controller, program};
}

export function getConnection(portNumber : number){
  return new Connection(
    `http://localhost:${portNumber}`,
    Provider.defaultOptions().commitment
  );

}

/**
 * Request and deliver an airdrop of pyth tokens to the associated token account of ```destination```
 */
export async function requestPythAirdrop(
  destination: PublicKey,
  pythMintAccount: PublicKey,
  pythMintAuthority: Keypair,
  amount: number,
  connection: Connection
) {
  // Testnet airdrop to ensure that the pyth authority can pay for gas
  await connection.requestAirdrop(pythMintAuthority.publicKey, 1_000_000_000);

  const transaction = new Transaction();

  const destinationAta = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pythMintAccount,
    destination
  );

  if ((await connection.getAccountInfo(destinationAta)) == null) {
    const createAtaIx = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount,
      destinationAta,
      destination,
      pythMintAuthority.publicKey
    );
    transaction.add(createAtaIx);
  }

  const mintIx = Token.createMintToInstruction(
    TOKEN_PROGRAM_ID,
    pythMintAccount,
    destinationAta,
    pythMintAuthority.publicKey,
    [],
    amount
  );
  transaction.add(mintIx);

  await connection.sendTransaction(transaction, [pythMintAuthority], {
    skipPreflight: true,
  });
}

/**
 * Creates new spl-token at a random keypair
 */
export async function createMint(
  provider: Provider,
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

export async function initConfig(program: Program, pythMintAccount: PublicKey) {
  const [configAccount, bump] = await PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
    program.programId
  );

  await program.methods
    .initConfig({
      governanceAuthority: program.provider.wallet.publicKey,
      pythTokenMint: pythMintAccount,
      unlockingDuration: 2,
      epochDuration: new BN(3600),
      mockClockTime: new BN(10),
    })
    .rpc({
      skipPreflight: true,
    });
}

export async function standardSetup(
  portNumber: number,
  config: AnchorConfig,
  pythMintAccount: Keypair,
  pythMintAuthority: Keypair,
) {
  const { controller, program } = await startValidator(portNumber, config);

  await createMint(
    program.provider,
    pythMintAccount,
    pythMintAuthority.publicKey,
    null,
    0,
    TOKEN_PROGRAM_ID
  );

  const user = program.provider.wallet.publicKey;

  await requestPythAirdrop(
    user,
    pythMintAccount.publicKey,
    pythMintAuthority,
    200,
    program.provider.connection
  );

  await initConfig(program, pythMintAccount.publicKey);

  const connection = new Connection(
    `http://localhost:${portNumber}`,
    Provider.defaultOptions().commitment
  );

  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    program.provider.wallet,
    config.programs.localnet.staking
  );

  return { controller, stakeConnection };
}
