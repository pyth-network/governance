/// <reference types="node" />
import {
  Program,
  Wallet,
  Idl,
  IdlAccounts,
  IdlTypes,
  AnchorProvider,
} from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import * as wasm2 from "pyth-staking-wasm";
import { u64 } from "@solana/spl-token";
import BN from "bn.js";
import { Staking } from "../target/types/staking";
import { PythBalance } from "./pythBalance";
import { PositionAccountJs } from "./PositionAccountJs";
declare let wasm: typeof wasm2;
export { wasm };
export declare type GlobalConfig = IdlAccounts<Staking>["globalConfig"];
declare type StakeAccountMetadata =
  IdlAccounts<Staking>["stakeAccountMetadataV2"];
declare type VestingSchedule = IdlTypes<Staking>["VestingSchedule"];
declare type VoterWeightAction = IdlTypes<Staking>["VoterWeightAction"];
export declare class StakeConnection {
  program: Program<Staking>;
  provider: AnchorProvider;
  config: GlobalConfig;
  configAddress: PublicKey;
  votingProductMetadataAccount: PublicKey;
  votingProduct: {
    voting: {};
  };
  governanceAddress: PublicKey;
  private constructor();
  static createStakeConnection(
    connection: Connection,
    wallet: Wallet,
    stakingProgramAddress: PublicKey
  ): Promise<StakeConnection>;
  getAllStakeAccountAddresses(): Promise<PublicKey[]>;
  /** Gets a users stake accounts */
  getStakeAccounts(user: PublicKey): Promise<StakeAccount[]>;
  /** Gets the user's stake account with the most tokens or undefined if it doesn't exist */
  getMainAccount(user: PublicKey): Promise<StakeAccount | undefined>;
  fetchVotingProductMetadataAccount(): Promise<wasm2.WasmTargetMetadata>;
  fetchPositionAccount(address: PublicKey): Promise<{
    stakeAccountPositionsWasm: wasm2.WasmPositionData;
    stakeAccountPositionsJs: PositionAccountJs;
  }>;
  loadStakeAccount(address: PublicKey): Promise<StakeAccount>;
  getTime(): Promise<BN>;
  unlockTokens(stakeAccount: StakeAccount, amount: PythBalance): Promise<void>;
  unlockTokensUnchecked(
    stakeAccount: StakeAccount,
    amount: PythBalance
  ): Promise<void>;
  withUpdateVoterWeight(
    instructions: TransactionInstruction[],
    stakeAccount: StakeAccount,
    action: VoterWeightAction,
    remainingAccount?: PublicKey
  ): Promise<{
    voterWeightAccount: PublicKey;
    maxVoterWeightRecord: PublicKey;
  }>;
  withCreateAccount(
    instructions: TransactionInstruction[],
    owner: PublicKey,
    vesting?: VestingSchedule
  ): Promise<Keypair>;
  private buildCloseInstruction;
  buildTransferInstruction(
    stakeAccountPositionsAddress: PublicKey,
    amount: BN
  ): Promise<TransactionInstruction>;
  hasGovernanceRecord(user: PublicKey): Promise<boolean>;
  /**
   * Locks all unvested tokens in governance
   */
  lockAllUnvested(stakeAccount: StakeAccount): Promise<void>;
  setupVestingAccount(
    amount: PythBalance,
    owner: PublicKey,
    vestingSchedule: any
  ): Promise<void>;
  depositTokens(
    stakeAccount: StakeAccount | undefined,
    amount: PythBalance
  ): Promise<void>;
  getTokenOwnerRecordAddress(user: PublicKey): Promise<PublicKey>;
  unlockBeforeVestingEvent(stakeAccount: StakeAccount): Promise<void>;
  unlockAll(stakeAccount: StakeAccount): Promise<void>;
  depositAndLockTokens(
    stakeAccount: StakeAccount | undefined,
    amount: PythBalance
  ): Promise<void>;
  withdrawTokens(
    stakeAccount: StakeAccount,
    amount: PythBalance
  ): Promise<void>;
}
export interface BalanceSummary {
  withdrawable: PythBalance;
  locked: {
    locking: PythBalance;
    locked: PythBalance;
    unlocking: PythBalance;
    preunlocking: PythBalance;
  };
  unvested: {
    total: PythBalance;
    locking: PythBalance;
    locked: PythBalance;
    unlocking: PythBalance;
    preunlocking: PythBalance;
    unlocked: PythBalance;
  };
}
export declare enum VestingAccountState {
  FullyVested = 0,
  UnvestedTokensFullyLocked = 1,
  UnvestedTokensFullyLockedExceptCooldown = 2,
  UnvestedTokensPartiallyLocked = 3,
  UnvestedTokensFullyUnlockedExceptCooldown = 4,
  UnvestedTokensFullyUnlocked = 5,
}
export declare class StakeAccount {
  address: PublicKey;
  stakeAccountPositionsWasm: any;
  stakeAccountPositionsJs: PositionAccountJs;
  stakeAccountMetadata: StakeAccountMetadata;
  tokenBalance: u64;
  authorityAddress: PublicKey;
  vestingSchedule: Buffer;
  votingAccountMetadataWasm: any;
  totalSupply: BN;
  config: GlobalConfig;
  constructor(
    address: PublicKey,
    stakeAccountPositionsWasm: any,
    stakeAccountPositionsJs: PositionAccountJs,
    stakeAccountMetadata: StakeAccountMetadata,
    tokenBalance: u64,
    authorityAddress: PublicKey,
    vestingSchedule: Buffer, // Borsh serialized
    votingAccountMetadataWasm: any,
    totalSupply: BN,
    config: GlobalConfig
  );
  getBalanceSummary(unixTime: BN): BalanceSummary;
  private adjustLockedAmount;
  getVoterWeight(unixTime: BN): PythBalance;
  getNextVesting(unixTime: BN): wasm2.VestingEvent;
  static serializeVesting(lock: VestingSchedule, idl: Idl): Buffer;
  getVestingAccountState(unixTime: BN): VestingAccountState;
  private addUnlockingPeriod;
  getNetExcessGovernanceAtVesting(unixTime: BN): BN;
}
