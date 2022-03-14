import { Provider, Program, Wallet, utils } from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";

export class StakeConnection {
  program: Program;
  config;

  // creates a program connection and loads the staking config
  // the constructor cannot be async so we use a static method
  public static async createStakeConnection(
    connection: Connection,
    wallet: Wallet,
    address: PublicKey
  ): Promise<StakeConnection> {
    const stake_connection = new StakeConnection();
    const provider = new Provider(connection, wallet, {});
    const idl = await Program.fetchIdl(address, provider);
    stake_connection.program = new Program(idl, address, provider);

    const config_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("config")],
        stake_connection.program.programId
      )
    )[0];

    stake_connection.config =
      await stake_connection.program.account.globalConfig.fetch(config_address);
    return stake_connection;
    return;
  }

  //gets a users stake accounts
  public async getStakeAccounts(user: PublicKey): Promise<StakeAccount[]> {
    return;
  }

  // creates stake account will happen inside deposit
  // public async createStakeAccount(user: PublicKey): Promise<StakeAccount> {
  //   return;
  // }

  async fetchPositionAccount(address: PublicKey) {
    return;
  }

  //stake accounts are loaded by a StakeConnection object
  public async loadStakeAccount(address: PublicKey): Promise<StakeAccount> {
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
    stake_account: StakeAccount | undefined,
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

export class StakeAccount {
  address: PublicKey;
  stake_account_positions;
  stake_account_metadata;
  token_balance;

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
