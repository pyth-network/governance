import { Provider, Program, Wallet, utils } from "@project-serum/anchor";
import { PublicKey, Connection } from "@solana/web3.js";
import { sha256 } from "js-sha256";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
// import { positions_account_size } from "../../staking/tests/utils/constant";
import * as wasm from "../../staking/wasm/node/staking"


const staking_program = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export class StakeConnection {
  program: Program;
  config: StakeConfig;

  // creates a program connection and loads the staking config
  // the constructor cannot be async so we use a static method
  public static async createStakeConnection(
    connection: Connection,
    wallet: Wallet,
    address: PublicKey
  ): Promise<StakeConnection> {

    const stake_connection = new StakeConnection();
    const provider = new Provider(connection, wallet, {});
    const idl = await Program.fetchIdl(staking_program, provider);
    stake_connection.program = new Program(idl, staking_program, provider);

    const config_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("config")],
        stake_connection.program.programId
      )
    )[0];


    stake_connection.config = await stake_connection.program.account.globalConfig.fetch(config_address);
    return stake_connection;
  }

  //gets a users stake accounts
  public async getStakeAccounts(user: PublicKey): Promise<PublicKey[]> {

    const discriminator = Buffer.from(
      sha256.digest(`account:PositionData`)
    ).slice(0, 8);

    const res = await this.program.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        encoding: "base64",
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
          // {
          //   memcmp: {
          //     offset: 8,
          //     bytes: user.toBase58(),
          //   },
          // },
        ],
      }
    );

    return await Promise.all(
      res.map(async (account) => {
        return account.pubkey;
      })
    );
  }

  // creates stake account and returns it as a StakeAccount
  public async createStakeAccount(user: PublicKey): Promise<StakeAccount> {
<<<<<<< HEAD
=======

    
>>>>>>> 824844e (wasm compatible)
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

  //factory static method instead of constructor
  public static async loadStakeAccount(
    address: PublicKey,
    program: Program
  ): Promise<StakeAccount> {

    const stake_account = new StakeAccount();

    const inbuf = await program.provider.connection.getAccountInfo(address);
    const outbuffer = Buffer.alloc(10*1024);
    wasm.convert_positions_account(inbuf.data, outbuffer);
    
    console.log(outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);
    
    stake_account.address = address;
    stake_account.stake_account_positions = positions;

    return stake_account;
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
