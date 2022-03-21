import { Provider, Program, Wallet, utils } from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  Signer,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";

// This seems to work for now, but I am not sure how fragile it is.
const useNode =
  typeof process !== undefined && process.env.hasOwnProperty("_")
  && (!process.env._.includes("next"));
// console.log("Using node WASM version? " + useNode);
let wasm;
if (useNode) {
  // This needs to be sufficiently complicated that the bundler can't compute its value
  // It means the bundler will give us a warning "the request of a dependency is an expression"
  // because it doesn't understand that it will never encounter a case in which useNode is true.
  // When normal node is running, it doesn't care that this is an expression.
  const path = useNode ? "../../staking/wasm/" + "node" + "/staking" : "BAD";
  wasm = await require(path);
} else {
  wasm = await require("../../staking/wasm/bundle/staking");
}

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

  private async withCreateAccount(
    instructions: TransactionInstruction[],
    owner: PublicKey
  ): Promise<Keypair> {
    const stake_account_keypair = new Keypair();

    const stakeAccountMetadata = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode("stake_metadata"),
          stake_account_keypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const stakeAccountCustody = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode("custody"),
          stake_account_keypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const custodyAuthority = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode("authority"),
          stake_account_keypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const voterRecord = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode("voter_weight"),
          stake_account_keypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const config = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("config")],
        this.program.programId
      )
    )[0];

    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: stake_account_keypair.publicKey,
        lamports:
          await this.program.provider.connection.getMinimumBalanceForRentExemption(
            positions_account_size
          ),
        space: positions_account_size,
        programId: this.program.programId,
      })
    );

    instructions.push(
      this.program.instruction.createStakeAccount(
        owner,
        { fullyVested: {} },
        {
          accounts: {
            payer: owner,
            stakeAccountMetadata,
            stakeAccountCustody,
            stakeAccountPositions: stake_account_keypair.publicKey,
            custodyAuthority,
            mint: this.config.pythTokenMint,
            voterRecord,
            config,
            rent: SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          },
        }
      )
    );

    return stake_account_keypair;
  }
  //deposit tokens
  public async depositAndLockTokens(
    stake_account: StakeAccount | undefined,
    amount: number
  ) {
    let stake_account_address: PublicKey;
    const owner = this.program.provider.wallet.publicKey;

    const ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      this.config.pythTokenMint,
      owner
    );

    const ixs: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    if (!stake_account) {
      const stake_account_keypair = await this.withCreateAccount(ixs, owner);
      signers.push(stake_account_keypair);
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

    ixs.push(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        ata,
        toAccount,
        owner,
        [],
        amount
      )
    );

    await this.program.methods
      .createPosition(null, null, new BN(amount))
      .preInstructions(ixs)
      .accounts({
        stakeAccountPositions: stake_account_address,
      })
      .signers(signers)
      .rpc({ skipPreflight: true });
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
