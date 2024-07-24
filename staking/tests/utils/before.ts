import { exec } from "child_process";
import { mkdtemp } from "fs/promises";
import {
  PublicKey,
  Connection,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";
import {
  Program,
  Wallet,
  utils,
  AnchorProvider,
  Provider,
} from "@coral-xyz/anchor";
import * as wasm from "@pythnetwork/staking-wasm";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
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
import { GlobalConfig, Target } from "../../app/StakeConnection";
import {
  createMint,
  getTargetAccount as getTargetAccount,
  initAddressLookupTable,
} from "./utils";
import { loadKeypair } from "./keys";
import { sendTransactions } from "@pythnetwork/solana-utils";
import * as StakingIdl from "../../target/idl/staking.json";
import { Staking } from "../../target/types/staking";

export const ANCHOR_CONFIG_PATH = "./Anchor.toml";
export interface AnchorConfig {
  path: {
    idl_path: string;
    binary_path: string;
    governance_path: string;
    chat_path: string;
    wallet_tester_path: string;
    profile_path: string;
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
      wallet_tester: string;
      profile: string;
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

export function getDummyAgreementHash(): number[] {
  return Array.from({ length: 32 }, (_, i) => i);
}

export function getDummyAgreementHash2(): number[] {
  return Array.from({ length: 32 }, (_, i) => 2);
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

  let numRetries = 0;
  while (true) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await connection.getSlot();
      break;
    } catch (e) {
      // Bound the number of retries so the tests don't hang if there's some problem blocking
      // the connection to the validator.
      if (numRetries == 30) {
        console.log(
          `Failed to start validator or connect to running validator. Caught exception: ${e}`
        );
        throw e;
      }
      numRetries += 1;
    }
  }
  return { controller, connection };
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
export async function startValidator(
  portNumber: number,
  config: AnchorConfig
): Promise<{ controller: CustomAbortController; program: Program<Staking> }> {
  const programAddress = new PublicKey(config.programs.localnet.staking);
  const idlPath = config.path.idl_path;
  const binaryPath = config.path.binary_path;

  const user = loadKeypair(config.provider.wallet);

  const otherArgs = `--mint ${
    user.publicKey
  } --reset --bpf-program ${programAddress.toBase58()} ${binaryPath} --bpf-program ${
    config.programs.localnet.governance
  } ${config.path.governance_path} --bpf-program ${
    config.programs.localnet.chat
  } ${config.path.chat_path}  --bpf-program ${
    config.programs.localnet.wallet_tester
  } ${config.path.wallet_tester_path} --bpf-program ${
    config.programs.localnet.profile
  } ${config.path.profile_path}

  --clone ENmcpFCpxN1CqyUjuog9yyUVfdXBKF3LVCwLr7grJZpk -ud`;

  const { controller, connection } = await startValidatorRaw(
    portNumber,
    otherArgs
  );

  const provider = new AnchorProvider(connection, new Wallet(user), {
    skipPreflight: true,
  });
  const program = new Program(StakingIdl as Staking, provider);

  if (process.env.DETACH) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    shell.exec(
      `anchor idl init -f ${idlPath} ${programAddress.toBase58()}  --provider.cluster ${
        connection.rpcEndpoint
      }`
    );
  }

  return { controller, program };
}

export function getConnection(portNumber: number): Connection {
  return new Connection(
    `http://127.0.0.1:${portNumber}`,
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
    destination,
    true
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

  await sendTransactions(
    [{ tx: transaction }],
    connection,
    new Wallet(pythMintAuthority)
  );
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
  provider: Provider,
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
    provider.publicKey,
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
    provider.publicKey,
    realmAuthority.publicKey,
    null
  );

  const mintGov = await withCreateNativeTreasury(
    tx.instructions,
    govProgramId,
    PROGRAM_VERSION_V2,
    governance,
    provider.publicKey
  );

  await provider.sendAndConfirm(tx, [realmAuthority]);

  // Give governance 100 SOL to play with
  await provider.connection.requestAirdrop(mintGov, LAMPORTS_PER_SOL * 100);

  return { realm, governance };
}

export async function initConfig(
  program: Program<Staking>,
  globalConfig: GlobalConfig
) {
  const [configAccount, bump] = await PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
    program.programId
  );

  await program.methods.initConfig(globalConfig).rpc();
}

export function makeDefaultConfig(
  pythTokenMint: PublicKey,
  governanceProgram: PublicKey,
  pdaAuthority: PublicKey
): GlobalConfig {
  return {
    governanceAuthority: null,
    pythGovernanceRealm: null,
    pythTokenMint,
    unlockingDuration: 1,
    epochDuration: new BN(3600),
    freeze: true,
    mockClockTime: new BN(10),
    bump: 0,
    pythTokenListTime: null,
    governanceProgram,
    pdaAuthority,
    agreementHash: getDummyAgreementHash(),
  };
}

export async function createTarget(program: Program<Staking>, target: Target) {
  const targetAccount = await getTargetAccount(target, program.programId);
  await program.methods
    .createTarget(target)
    .accounts({
      targetAccount,
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
    baseVotingTime: maxVotingTime,
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
    votingCoolOffTime: 0,
    depositExemptProposalCount: 255,
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

export interface Authorities {
  pythMintAuthority: Keypair;
  pdaAuthority: Keypair;
  poolAuthority: Keypair;
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
export async function standardSetup(portNumber: number): Promise<{
  controller: CustomAbortController;
  stakeConnection: StakeConnection;
  authorities: Authorities;
}> {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const pdaAuthority = new Keypair();
  const poolAuthority = new Keypair();

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
  const globalConfig = makeDefaultConfig(
    pythMintAccount.publicKey,
    new PublicKey(config.programs.localnet.governance),
    pdaAuthority.publicKey
  );

  const { controller, program } = await startValidator(portNumber, config);

  await createMint(
    program.provider,
    pythMintAccount,
    pythMintAuthority.publicKey,
    null,
    PYTH_DECIMALS,
    TOKEN_PROGRAM_ID
  );

  const user = program.provider.publicKey;

  await requestPythAirdrop(
    user,
    pythMintAccount.publicKey,
    pythMintAuthority,
    PythBalance.fromString("1000"),
    program.provider.connection
  );

  if (globalConfig.pythGovernanceRealm == null) {
    const { realm, governance } = await createDefaultRealm(
      program.provider,
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

  await initConfig(program, temporaryConfig);

  await createTarget(program, { voting: {} });
  await createTarget(program, {
    integrityPool: { poolAuthority: poolAuthority.publicKey },
  });

  if (process.env.DETACH) {
    const lookupTableAddress = await initAddressLookupTable(
      program.provider,
      pythMintAccount.publicKey
    );
    console.log("Lookup table address: ", lookupTableAddress.toBase58());
  }

  // Give the power back to the people
  await program.methods
    .updateGovernanceAuthority(globalConfig.governanceAuthority)
    .accounts({ governanceSigner: user })
    .rpc();

  const connection = new Connection(
    `http://127.0.0.1:${portNumber}`,
    AnchorProvider.defaultOptions().commitment
  );

  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    (program.provider as AnchorProvider).wallet as Wallet,
    new PublicKey(config.programs.localnet.staking)
  );

  return {
    controller,
    stakeConnection,
    authorities: { pdaAuthority, pythMintAuthority, poolAuthority },
  };
}
