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
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";
import {
  Program,
  Provider,
  Wallet,
  utils,
  AnchorProvider,
} from "@project-serum/anchor";
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
  GoverningTokenType,
  MintMaxVoteWeightSource,
  PROGRAM_VERSION_V2,
  VoteThreshold,
  VoteThresholdType,
  VoteTipping,
  withCreateGovernance,
  withCreateNativeTreasury,
  withCreateRealm,
} from "@solana/spl-governance";
import shell from "shelljs";
import BN from "bn.js";
import toml from "toml";
import path from "path";
import os from "os";
import { StakeConnection, PythBalance, PYTH_DECIMALS } from "../../app";
import { GlobalConfig } from "../../app/StakeConnection";
import { createMint, getTargetAccount as getTargetAccount } from "./utils";

export const ANCHOR_CONFIG_PATH = "./Anchor.toml";
export interface AnchorConfig {
  path: {
    idl_path: string;
    binary_path: string;
    governance_path: string;
    chat_path: string;
  };
  provider: {
    cluster: string;
    wallet: string;
  };
  programs: {
    localnet: {
      staking: string;
      governance: string;
      chat: string;
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
 * Starts a validator at port portNumber with the command line arguments specified after a few basic ones
 *
 * returns a `{ controller, connection }` struct. Users of this method have to terminate the
 * validator by calling :
 * ```controller.abort()```
 */
export async function startValidatorRaw(portNumber: number, otherArgs: string) {
  const connection: Connection = getConnection(portNumber);
  const ledgerDir = await mkdtemp(path.join(os.tmpdir(), "ledger-"));

  const internalController: AbortController = new AbortController();
  const { signal } = internalController;

  exec(
    `solana-test-validator --ledger ${ledgerDir} --rpc-port ${portNumber} --faucet-port ${
      portNumber + 101
    } ${otherArgs}`,
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
  const controller = new CustomAbortController(internalController);

  while (true) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await connection.getEpochInfo();
      break;
    } catch (e) {}
  }
  return { controller, connection };
}

/**
 * Starts a validator at port portNumber with the staking program deployed the address defined in lib.rs.
 * Also takes config as an argument, config is obtained by parsing Anchor.toml
 *
 * ```const config = readAnchorConfig(ANCHOR_CONFIG_PATH)```
 *
 * returns a `{controller, program, provider}` struct. Users of this method have to terminate the
 * validator by calling :
 * ```controller.abort()```
 */
export async function startValidator(portNumber: number, config: AnchorConfig) {
  const programAddress = new PublicKey(config.programs.localnet.staking);
  const idlPath = config.path.idl_path;
  const binaryPath = config.path.binary_path;

  const user = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(config.provider.wallet).toString())
    )
  );

  const otherArgs = `--mint ${
    user.publicKey
  } --reset --bpf-program ${programAddress.toBase58()} ${binaryPath} --bpf-program ${
    config.programs.localnet.governance
  } ${config.path.governance_path} --bpf-program ${
    config.programs.localnet.chat
  } ${
    config.path.chat_path
  } --clone ENmcpFCpxN1CqyUjuog9yyUVfdXBKF3LVCwLr7grJZpk -ud`;

  const { controller, connection } = await startValidatorRaw(
    portNumber,
    otherArgs
  );

  const provider = new AnchorProvider(connection, new Wallet(user), {});
  const program = new Program(
    JSON.parse(fs.readFileSync(idlPath).toString()),
    programAddress,
    provider
  );

  shell.exec(
    `anchor idl init -f ${idlPath} ${programAddress.toBase58()}  --provider.cluster ${
      connection.rpcEndpoint
    }`
  );

  return { controller, program, provider };
}

export function getConnection(portNumber: number): Connection {
  return new Connection(
    `http://localhost:${portNumber}`,
    AnchorProvider.defaultOptions().commitment
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

interface GovernanceIds {
  realm: PublicKey;
  governance: PublicKey;
}
/*
  Creates a governance realm using the SPL-governance deployment in config.
  Creates an account governance with a 20% vote threshold that can sign using the PDA this function returns.
*/
export async function createDefaultRealm(
  provider: AnchorProvider,
  config: AnchorConfig,
  maxVotingTime: number, // in seconds
  pythMint: PublicKey
): Promise<GovernanceIds> {
  const realmAuthority = Keypair.generate();
  const tx = new Transaction();
  const govProgramId = new PublicKey(config.programs.localnet.governance);

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
    new BN(200), // 200 required so we can create governances during tests
    {
      voterWeightAddin: new PublicKey(config.programs.localnet.staking),
      maxVoterWeightAddin: new PublicKey(config.programs.localnet.staking),
      tokenType: GoverningTokenType.Liquid,
    },
    undefined
  );

  const governance = await withCreateDefaultGovernance(
    tx,
    maxVotingTime,
    govProgramId,
    realm,
    new PublicKey(0),
    provider.wallet.publicKey,
    realmAuthority.publicKey,
    null
  );

  const mintGov = await withCreateNativeTreasury(
    tx.instructions,
    govProgramId,
    PROGRAM_VERSION_V2,
    governance,
    provider.wallet.publicKey
  );

  await provider.sendAndConfirm(tx, [realmAuthority], { skipPreflight: true });

  // Give governance 100 SOL to play with
  await provider.connection.requestAirdrop(mintGov, LAMPORTS_PER_SOL * 100);

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
    unlockingDuration: 1,
    epochDuration: new BN(3600),
    freeze: false,
    mockClockTime: new BN(10),
    bump: 0,
  };
}

export async function initGovernanceProduct(
  program: Program,
  governanceSigner: PublicKey
) {
  const votingProduct = { voting: {} };
  const targetAccount = await getTargetAccount(
    votingProduct,
    program.programId
  );
  await program.methods
    .createTarget(votingProduct)
    .accounts({
      targetAccount,
      governanceSigner: governanceSigner,
    })
    .rpc();
}

export async function withCreateDefaultGovernance(
  tx: Transaction,
  maxVotingTime: number,
  govProgramId: PublicKey,
  realm: PublicKey,
  tokenOwnerRecord: PublicKey,
  payer: PublicKey,
  authority: PublicKey,
  voterWeightRecord: PublicKey
) {
  const governanceConfig = new GovernanceConfig({
    communityVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 20,
    }),
    minCommunityTokensToCreateProposal: PythBalance.fromNumber(200).toBN(),
    minInstructionHoldUpTime: 1,
    maxVotingTime: maxVotingTime,
    communityVoteTipping: VoteTipping.Strict,
    minCouncilTokensToCreateProposal: new BN(1),
    councilVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 0,
    }),
    councilVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 0,
    }),
    communityVetoVoteThreshold: new VoteThreshold({
      type: VoteThresholdType.YesVotePercentage,
      value: 0,
    }),
    councilVoteTipping: VoteTipping.Strict,
  });
  const governance = await withCreateGovernance(
    tx.instructions,
    govProgramId,
    PROGRAM_VERSION_V2,
    realm,
    tokenOwnerRecord,
    governanceConfig,
    tokenOwnerRecord,
    payer,
    authority,
    voterWeightRecord
  );

  return governance;
}
/**
 * Standard setup for test, this function :
 * - Launches at validator at `portNumber`
 * - Creates a Pyth token in the localnet environment
 * - Airdrops Pyth token to the currently connected wallet
 * - If the passed in global config has a null pythGovernanceRealm, creates a default governance
 * - Initializes the global config of the Pyth staking program to some default values
 * - Creates a connection to the localnet Pyth staking program
 * */
export async function standardSetup(
  portNumber: number,
  config: AnchorConfig,
  pythMintAccount: Keypair,
  pythMintAuthority: Keypair,
  globalConfig: GlobalConfig,
  amount?: PythBalance
) {
  const { controller, program, provider } = await startValidator(
    portNumber,
    config
  );

  await createMint(
    provider,
    pythMintAccount,
    pythMintAuthority.publicKey,
    null,
    PYTH_DECIMALS,
    TOKEN_PROGRAM_ID
  );

  const user = provider.wallet.publicKey;

  await requestPythAirdrop(
    user,
    pythMintAccount.publicKey,
    pythMintAuthority,
    amount ? amount : PythBalance.fromString("200"),
    program.provider.connection
  );

  if (globalConfig.pythGovernanceRealm == null) {
    const { realm, governance } = await createDefaultRealm(
      provider,
      config,
      Math.max(globalConfig.epochDuration.toNumber(), 60), // at least one minute
      pythMintAccount.publicKey
    );
    globalConfig.governanceAuthority = governance;
    globalConfig.pythGovernanceRealm = realm;
  }

  const temporaryConfig = { ...globalConfig };
  // User becomes a temporary dictator during setup
  temporaryConfig.governanceAuthority = user;

  await initConfig(program, pythMintAccount.publicKey, temporaryConfig);

  await initGovernanceProduct(program, user);

  // Give the power back to the people
  await program.methods
    .updateGovernanceAuthority(globalConfig.governanceAuthority)
    .accounts({ governanceSigner: user })
    .rpc();

  const connection = new Connection(
    `http://localhost:${portNumber}`,
    AnchorProvider.defaultOptions().commitment
  );

  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    provider.wallet as Wallet,
    new PublicKey(config.programs.localnet.staking)
  );

  return { controller, stakeConnection };
}
