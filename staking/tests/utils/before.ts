import { exec } from "child_process";
import { mkdtemp } from "fs/promises";
import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  BPF_LOADER_PROGRAM_ID,
  TransactionInstruction,
} from "@solana/web3.js";
import fs from "fs";
import { Program, Provider, Wallet, utils } from "@project-serum/anchor";
import * as wasm from "../../wasm/node/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
import { MintLayout } from "@solana/spl-token";
import {
  GovernanceConfig,
  MintMaxVoteWeightSource,
  MintMaxVoteWeightSourceType,
  PROGRAM_VERSION_V2,
  VoteThresholdPercentage,
  withCreateGovernance,
  withCreateRealm,
} from "@solana/spl-governance";
import shell from "shelljs";
import BN from "bn.js";
import toml from "toml";
import path from "path";
import os from "os";
import { StakeConnection, PythBalance, PYTH_DECIMALS } from "../../app";
import { GlobalConfig } from "../../app/StakeConnection";
import { getProductAccount } from "./utils";

export const ANCHOR_CONFIG_PATH = "./Anchor.toml";
export interface AnchorConfig {
  path: {
    idl_path: string;
    binary_path: string;
    governance_path: string;
  };
  provider: {
    cluster: string;
    wallet: string;
  };
  programs: {
    localnet: {
      staking: string;
      governance: string;
    };
  };
  validator: {
    port: number;
    ledger_dir: string;
  };
}

export function readAnchorConfig(pathToAnchorToml: string): AnchorConfig {
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
  const portNumber = 8899 - 2 * index;
  return portNumber;
}
/**
 * If we abort immediately, the websockets are still subscribed, and they give a ton of errors.
 * Waiting a few seconds is enough to let the sockets close.
 */
export class CustomAbortController {
  abortController: AbortController;
  constructor(abortController: AbortController) {
    this.abortController = abortController;
  }
  abort() {
    setTimeout(() => this.abortController.abort(), 5000);
  }
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
export async function startValidator(portNumber: number, config: AnchorConfig) {
  const connection: Connection = getConnection(portNumber);

  const internalController: AbortController = new AbortController();
  const { signal } = internalController;

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
    } --reset --bpf-program  ${programAddress.toBase58()} ${binaryPath} --bpf-program ${
      config.programs.localnet.governance
    } ${config.path.governance_path} --faucet-port ${portNumber + 101}`,
    { signal },
    (error, stdout, stderr) => {
      if (error.name.includes("AbortError")) {
        // Test complete, this is expected.
        return;
      }
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
  const controller = new CustomAbortController(internalController);
  return { controller, program };
}

export function getConnection(portNumber: number): Connection {
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
  amount: PythBalance,
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
    new u64(amount.toBN().toString())
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
interface GovernanceIds {
  realm: PublicKey;
  governance: PublicKey;
}
/*
  Creates a governance realm using the SPL-governance deployment in config.
  Creates an account governance with a 20% vote threshold that can sign using the PDA this function returns.
*/
export async function createGovernance(
  provider: Provider,
  config: AnchorConfig,
  maxVotingTime: number, // in seconds
  pythMint: PublicKey
): Promise<GovernanceIds> {
  const realmAuthority = Keypair.generate();
  const tx = new Transaction();
  const govProgramId = new PublicKey(config.programs.localnet.governance);
  const MIN_TOKENS_CREATE_PROPOSAL = PythBalance.fromNumber(200).toBN();

  const realm = await withCreateRealm(
    tx.instructions,
    govProgramId,
    PROGRAM_VERSION_V2,
    "Pyth Governance",
    realmAuthority.publicKey,
    pythMint,
    provider.wallet.publicKey,
    undefined, // no council mint
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    MintMaxVoteWeightSource.SUPPLY_FRACTION_BASE, // Full token supply required to create a gov, i.e. only realmAuth can do it
    new PublicKey(config.programs.localnet.staking),
    undefined // new PublicKey(config.programs.localnet.staking) //TODO: Restore after max voter weight plugin implemented
  );
  const governanceConfig = new GovernanceConfig({
    voteThresholdPercentage: new VoteThresholdPercentage({ value: 20 }),
    minCommunityTokensToCreateProposal: MIN_TOKENS_CREATE_PROPOSAL,
    minInstructionHoldUpTime: 1,
    maxVotingTime: maxVotingTime,
    minCouncilTokensToCreateProposal: new BN(1),
  });
  const governance = await withCreateGovernance(
    tx.instructions,
    govProgramId,
    PROGRAM_VERSION_V2,
    realm,
    undefined,
    governanceConfig,
    new PublicKey(0),
    provider.wallet.publicKey,
    realmAuthority.publicKey,
    null
  );
  await provider.send(tx, [realmAuthority], { skipPreflight: true });

  return { realm, governance };
}

export async function initConfig(
  program: Program,
  pythMintAccount: PublicKey,
  globalConfig: GlobalConfig
) {
  const [configAccount, bump] = await PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
    program.programId
  );

  await program.methods.initConfig(globalConfig).rpc({
    skipPreflight: true,
  });
}

export function makeDefaultConfig(pythMint: PublicKey): GlobalConfig {
  return {
    governanceAuthority: null,
    pythGovernanceRealm: null,
    pythTokenMint: pythMint,
    unlockingDuration: 2,
    epochDuration: new BN(3600),
    mockClockTime: new BN(10),
    bump: 0,
  };
}

export async function initGovernanceProduct(program: Program) {
  const productAccount = await getProductAccount(null, program.programId);

  await program.methods.createProduct(null).accounts({ productAccount }).rpc();
}

/**
 * Standard setup for test, this function :
 * - Launches at validator at `portNumber`
 * - Creates a Pyth token in the localnet environment
 * - Airdrops Pyth token to the currently connected wallet
 * - If the passed in global config has a null pythGovernanceRealm, creates a default governance
 * - Initializes the global config of the Pyth staking program to some default values
 * - Creates a connection de the localnet Pyth staking program
 * */
export async function standardSetup(
  portNumber: number,
  config: AnchorConfig,
  pythMintAccount: Keypair,
  pythMintAuthority: Keypair,
  globalConfig: GlobalConfig,
  amount?: PythBalance
) {
  const { controller, program } = await startValidator(portNumber, config);

  await createMint(
    program.provider,
    pythMintAccount,
    pythMintAuthority.publicKey,
    null,
    PYTH_DECIMALS,
    TOKEN_PROGRAM_ID
  );

  const user = program.provider.wallet.publicKey;

  await requestPythAirdrop(
    user,
    pythMintAccount.publicKey,
    pythMintAuthority,
    amount ? amount : PythBalance.fromString("200"),
    program.provider.connection
  );

  if (globalConfig.pythGovernanceRealm == null) {
    const { realm, governance } = await createGovernance(
      program.provider,
      config,
      globalConfig.epochDuration.toNumber(),
      pythMintAccount.publicKey
    );
    globalConfig.governanceAuthority = governance;
    globalConfig.pythGovernanceRealm = realm;
  }

  await initConfig(program, pythMintAccount.publicKey, globalConfig);

  await initGovernanceProduct(program);

  const connection = new Connection(
    `http://localhost:${portNumber}`,
    Provider.defaultOptions().commitment
  );

  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    program.provider.wallet as Wallet,
    new PublicKey(config.programs.localnet.staking)
  );

  return { controller, stakeConnection };
}
