import { Provider, Program, Wallet, utils } from "@project-serum/anchor";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import * as wasm from "../../staking/wasm/node/staking";
import { sha256 } from "js-sha256";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { positions_account_size } from "../../staking/tests/utils/constant";
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";

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
    return await Promise.all(
      res.map(async (account) => {
        return await this.loadStakeAccount(account.pubkey);
      })
    );
  }

  // creates stake account will happen inside deposit
  // public async createStakeAccount(user: PublicKey): Promise<StakeAccount> {
  //   return;
  // }

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

  //stake accounts are loaded by a StakeConnection object
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

    const custody_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("custody"), address.toBuffer()],
        this.program.programId
      )
    )[0];

    stake_account.authority_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("authority"), address.toBuffer()],
        this.program.programId
      )
    )[0];

    const mint = new Token(
      this.program.provider.connection,
      this.config.pythTokenMint,
      TOKEN_PROGRAM_ID,
      new Keypair()
    );
    stake_account.token_balance = (
      await mint.getAccountInfo(custody_address)
    ).amount;
    return stake_account;
  }

  //unlock a provided token balance
  public async unlockTokens(
    stake_account: StakeAccount,
    amount: number,
    program: Program
  ) {}

  //deposit tokens
  public async depositAndLockTokens(
    amount: number,
    stake_account?: StakeAccount
  ) {
    const stake_account_keypair = new Keypair();
    let stake_account_address: PublicKey;

    const owner = this.program.provider.wallet.publicKey;

    if (stake_account == null) {
      const tx = await this.program.methods
        .createStakeAccount(owner, { fullyVested: {} })
        .preInstructions([
          SystemProgram.createAccount({
            fromPubkey: owner,
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

      stake_account_address = stake_account_keypair.publicKey;
    } else {
      stake_account_address = stake_account.address;
    }

    const toAccount = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("custody"), stake_account_address.toBuffer()],
        this.program.programId
      )
    )[0];

    const ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      this.config.pythTokenMint,
      owner
    );

    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      ata,
      toAccount,
      owner,
      [],
      amount
    );

    await this.program.methods
      .createPosition(null, null, new BN(amount))
      .preInstructions([ix])
      .accounts({
        stakeAccountPositions: stake_account_address,
      })
      .rpc();
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
  token_balance;
  authority_address;

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
