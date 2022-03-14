import { Provider, Program, Wallet, utils } from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  SystemProgram,
  Transaction,
  Keypair,
} from "@solana/web3.js";
import { createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { sha256 } from "js-sha256";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { positions_account_size } from "../../staking/tests/utils/constant";
import * as wasm from "../../staking/wasm/bundle/staking";
import { CUSTODY_SEED, PYTH_MINT_PUBKEY } from "./constants";
import { findAssociatedTokenAddress } from "./utils";

const staking_program = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

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
    const idl = await Program.fetchIdl(staking_program, provider);
    stake_connection.program = new Program(idl, staking_program, provider);

    const config_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("config")],
        stake_connection.program.programId
      )
    )[0];

    stake_connection.config =
      await stake_connection.program.account.globalConfig.fetch(config_address);
    return stake_connection;
  }

  //gets a users stake accounts
  public async getStakeAccounts(user: PublicKey): Promise<StakeAccount[]> {
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
          {
            memcmp: {
              offset: 8,
              bytes: user.toBase58(),
            },
          },
        ],
      }
    );
    // console.log(res.length);
    return await Promise.all(
      res.map(async (account) => {
        return await this.loadStakeAccount(account.pubkey);
      })
    );
  }

  async fetchPositionAccount(address: PublicKey) {
    const inbuf = await this.program.provider.connection.getAccountInfo(
      address
    );
    const outbuffer = Buffer.alloc(10 * 1024);
    wasm.convert_positions_account(inbuf.data, outbuffer);
    const positions = this.program.coder.accounts.decode(
      "PositionData",
      outbuffer
    );
    return positions;
  }

  //factory static method instead of constructor
  public async loadStakeAccount(address: PublicKey): Promise<StakeAccount> {
    const stake_account = new StakeAccount();

    stake_account.address = address;
    stake_account.stake_account_positions = await this.fetchPositionAccount(
      address
    );

    const metadata_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("stake_metadata"), address.toBuffer()],
        this.program.programId
      )
    )[0];

    stake_account.stake_account_metadata =
      await this.program.account.stakeAccountMetadata.fetch(metadata_address);

    return stake_account;
  }

  // creates stake account and returns it as a StakeAccount
  public async createStakeAccount(user: PublicKey): Promise<StakeAccount> {
    const stake_account_keypair = new Keypair();
    console.log(this.program.provider.wallet.publicKey.toBase58());
    const tx = await this.program.methods
      .createStakeAccount(user, { fullyVested: {} })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: user,
          newAccountPubkey: stake_account_keypair.publicKey,
          lamports:
            await this.program.provider.connection.getMinimumBalanceForRentExemption(
              positions_account_size
            ),
          space: positions_account_size,
          programId: this.program.programId,
        }),
      ])
      .accounts({
        stakeAccountPositions: stake_account_keypair.publicKey,
        mint: this.config.pythTokenMint,
      })
      .signers([stake_account_keypair])
      .rpc({ skip_preflight: true });

    return await this.loadStakeAccount(stake_account_keypair.publicKey);
  }

  //unlock a provided token balance
  public async unlockTokens(
    stake_account: StakeAccount,
    amount: number,
    program: Program
  ) {}

  //deposit tokens
  public async depositAndLockTokens(
    user: PublicKey,
    stake_account: StakeAccount,
    amount: number
  ) {
    const transaction = new Transaction();
    const toAccount = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(CUSTODY_SEED),
          stake_account.address.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const ata = await findAssociatedTokenAddress(user, PYTH_MINT_PUBKEY);

    const ix = createTransferInstruction(
      ata,
      toAccount,
      user,
      amount,
      [],
      TOKEN_PROGRAM_ID
    );
    transaction.add(ix);
    const tx = await this.program.provider.send(transaction);
    console.log(`deposited ${amount} $PYTH`);
  }

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
