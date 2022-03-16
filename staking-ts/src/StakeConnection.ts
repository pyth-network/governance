import { Provider, Program, Wallet, utils, Coder } from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  Signer,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as wasm from "../../staking/wasm/node/staking";
import { sha256 } from "js-sha256";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { positions_account_size } from "../../staking/tests/utils/constant";
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  u64,
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

  async fetchPositionAccount(
    address: PublicKey
  ): Promise<[wasm.WasmPositionData, any]> {
    const inbuf = await this.program.provider.connection.getAccountInfo(
      address
    );
    const pd = new wasm.WasmPositionData(inbuf.data);
    const outBuffer = Buffer.alloc(pd.borshLength);
    pd.asBorsh(outBuffer);
    const positions = this.program.coder.accounts.decode(
      "PositionData",
      outBuffer
    );
    return [pd, positions];
  }

  //stake accounts are loaded by a StakeConnection object
  public async loadStakeAccount(address: PublicKey): Promise<StakeAccount> {
    const stake_account = new StakeAccount();
    stake_account.config = this.config;

    stake_account.address = address;
    [
      stake_account.stakeAccountPositionsWasm,
      stake_account.stakeAccountPositionsJs,
    ] = await this.fetchPositionAccount(address);

    const metadata_address = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode("stake_metadata"), address.toBuffer()],
        this.program.programId
      )
    )[0];

    stake_account.stake_account_metadata =
      await this.program.account.stakeAccountMetadata.fetch(metadata_address);
    stake_account.vestingSchedule = StakeAccount.serializeVesting(stake_account.stake_account_metadata.lock, this.program.coder);

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
export interface BalanceSummary {
  withdrawable: BN;
  // We may break this down into active, warmup, and cooldown in the future
  locked: BN;
  unvested: BN;
}

export class StakeAccount {

  address: PublicKey;
  stakeAccountPositionsWasm: wasm.WasmPositionData;
  stakeAccountPositionsJs: any;
  stake_account_metadata;
  token_balance: u64;
  authority_address;
  vestingSchedule: Buffer; // Borsh serialized
  config: any;


  // Withdrawable

  //Locked tokens :
  // - warmup
  // - active
  // - cooldown

  // Unvested

  public getBalanceSummary(unixTime: BN): BalanceSummary {
    let unvested = wasm.getUnvestedBalance(this.vestingSchedule, BigInt(unixTime.toString()));
    let currentEpoch = 0;
    let unlockingDuration = 0;
    
    const withdrawable = this.stakeAccountPositionsWasm.getWithdrawable(
      BigInt(this.token_balance.toString()),
      unvested,
      BigInt(currentEpoch),
      unlockingDuration
    );
    const withdrawableBN = new BN(withdrawable.toString());
    const unvestedBN = new BN(unvested.toString());
    return {
      withdrawable: withdrawableBN,
      locked: this.token_balance.sub(withdrawableBN).sub(unvestedBN),
      unvested: unvestedBN,
    };
  }

  // What is the best way to represent current vesting schedule in the UI
  public getVestingSchedule() {}

  static serializeVesting(lock: any, coder: Coder): any {
    // TODO: This is kind of terrible, but it's the best way to do it so far
    const VESTING_SCHED_MAX_BORSH_LEN = 4*8+1;
    let buffer = Buffer.alloc(VESTING_SCHED_MAX_BORSH_LEN);
    const coderInstr : any = coder.instruction; // ixLayout is a private field
    // We know vesting schedule is part of the data for createStakeAccount,
    // so pull the layout from it
    const vestingSchedLayout = coderInstr.ixLayout.get("createStakeAccount").fields[1];
    const length =  vestingSchedLayout.encode(lock, buffer, 0);
    return buffer.slice(0, length);
  }
}
