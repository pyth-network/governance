import { Provider, Program, Wallet } from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";

export class StakeConnection {
  program: Program;
  config: StakeConfig;

  // creates a program connection and loads the staking config
  public static async createStakeConnection(
    connection: Connection,
    wallet: Wallet,
    address: PublicKey
  ): Promise<StakeConnection> {
    return;
  }

  //gets a users stake accounts
  public async getStakeAccounts(user: PublicKey): Promise<StakeAccount[]> {
    return;
  }

  // creates stake account and returns it as a StakeAccount
  public async createStakeAccount(user: PublicKey): Promise<StakeAccount> {
    return;
  }

  //unlock a provided token balance
  public async unlockTokens(
    stake_account: StakeAccount,
    amount: number,
    program: Program
  ) {}

  //deposit tokens
  public async depositAndLockTokens(
    stake_account: StakeAccount,
    amount: number,
    program: Program
  ) {}

  //withdraw tokens
  public async withdrawTokens(
    stake_account: StakeAccount,
    amount: number,
    program: Program
  ) {}
}

export class StakeConfig {}

export class StakeAccount {
  address: PublicKey;
  stake_account_positions;
  stake_account_metadata;

  //factory method
  public static async loadStakeAccount(
    address: PublicKey,
    program: Program
  ): Promise<StakeAccount> {
    return;
  }

  // Withdrawable

  //Locked tokens :
  // - warmup
  // - active
  // - cooldown

  // Unvested

  public getBalanceSummary() {}

  // What is the best way to represent current vesting schedule in the UI
  public getVestingSchedule() {}
}
