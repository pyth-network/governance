import {
  Provider,
  Program,
  Wallet,
  utils,
  Coder,
  Idl,
  IdlAccounts,
  IdlTypes,
} from "@project-serum/anchor";
import {
  PublicKey,
  Connection,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  Signer,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import * as wasm from "../wasm/node/staking";
import { sha256 } from "js-sha256";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
import BN from "bn.js";
import * as idljs from "@project-serum/anchor/dist/cjs/coder/borsh/idl";
import { Staking } from "../../staking/target/types/staking";

type GlobalConfig = IdlAccounts<Staking>["globalConfig"];
type PositionData = IdlAccounts<Staking>["positionData"];
type StakeAccountMetadata = IdlAccounts<Staking>["stakeAccountMetadata"];
type VestingSchedule = IdlTypes<Staking>["VestingSchedule"];

export class StakeConnection {
  program: Program<Staking>;
  config: GlobalConfig;

  // creates a program connection and loads the staking config
  // the constructor cannot be async so we use a static method
  public static async createStakeConnection(
    connection: Connection,
    wallet: Wallet,
    address: PublicKey
  ): Promise<StakeConnection> {
    const stakeConnection = new StakeConnection();
    const provider = new Provider(connection, wallet, {});
    const idl = await Program.fetchIdl(address, provider);
    stakeConnection.program = new Program(
      idl,
      address,
      provider
    ) as Program<Staking>;

    const configAddress = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
        stakeConnection.program.programId
      )
    )[0];

    stakeConnection.config =
      await stakeConnection.program.account.globalConfig.fetch(configAddress);
    return stakeConnection;
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
  ): Promise<[wasm.WasmPositionData, PositionData]> {
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
    const stakeAccount = new StakeAccount();
    stakeAccount.config = this.config;

    stakeAccount.address = address;
    [
      stakeAccount.stakeAccountPositionsWasm,
      stakeAccount.stakeAccountPositionsJs,
    ] = await this.fetchPositionAccount(address);

    const metadataAddress = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.STAKE_ACCOUNT_METADATA_SEED()),
          address.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    stakeAccount.stakeAccountMetadata =
      (await this.program.account.stakeAccountMetadata.fetch(
        metadataAddress
      )) as any as StakeAccountMetadata; // TS complains about types. Not exactly sure why they're incompatible.
    stakeAccount.vestingSchedule = StakeAccount.serializeVesting(
      stakeAccount.stakeAccountMetadata.lock,
      this.program.idl
    );

    const custodyAddress = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
          address.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    stakeAccount.authorityAddress = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.AUTHORITY_SEED()),
          address.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const mint = new Token(
      this.program.provider.connection,
      this.config.pythTokenMint,
      TOKEN_PROGRAM_ID,
      new Keypair()
    );
    stakeAccount.tokenBalance = (
      await mint.getAccountInfo(custodyAddress)
    ).amount;
    return stakeAccount;
  }

  //unlock a provided token balance
  public async unlockTokens(
    stakeAccount: StakeAccount,
    amount: number,
    program: Program
  ) {}

  private async withCreateAccount(
    instructions: TransactionInstruction[],
    owner: PublicKey
  ): Promise<Keypair> {
    const stakeAccountKeypair = new Keypair();

    const stakeAccountMetadata = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.STAKE_ACCOUNT_METADATA_SEED()),
          stakeAccountKeypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const stakeAccountCustody = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
          stakeAccountKeypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const custodyAuthority = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.AUTHORITY_SEED()),
          stakeAccountKeypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const voterRecord = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
          stakeAccountKeypair.publicKey.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const config = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
        this.program.programId
      )
    )[0];

    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: stakeAccountKeypair.publicKey,
        lamports:
          await this.program.provider.connection.getMinimumBalanceForRentExemption(
            wasm.Constants.POSITIONS_ACCOUNT_SIZE()
          ),
        space: wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
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
            stakeAccountPositions: stakeAccountKeypair.publicKey,
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

    return stakeAccountKeypair;
  }
  //deposit tokens
  public async depositAndLockTokens(
    stakeAccount: StakeAccount | undefined,
    amount: number
  ) {
    let stakeAccountAddress: PublicKey;
    const owner = this.program.provider.wallet.publicKey;

    const ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      this.config.pythTokenMint,
      owner
    );

    const ixs: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    if (!stakeAccount) {
      const stakeAccountKeypair = await this.withCreateAccount(ixs, owner);
      signers.push(stakeAccountKeypair);
      stakeAccountAddress = stakeAccountKeypair.publicKey;
    } else {
      stakeAccountAddress = stakeAccount.address;
    }

    const toAccount = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
          stakeAccountAddress.toBuffer(),
        ],
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
        stakeAccountPositions: stakeAccountAddress,
      })
      .signers(signers)
      .rpc({ skipPreflight: true });
  }

  //withdraw tokens
  public async withdrawTokens(
    stakeAccount: StakeAccount,
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
  stakeAccountPositionsJs: PositionData;
  stakeAccountMetadata: StakeAccountMetadata;
  tokenBalance: u64;
  authorityAddress: PublicKey;
  vestingSchedule: Buffer; // Borsh serialized
  config: GlobalConfig;

  // Withdrawable

  //Locked tokens :
  // - warmup
  // - active
  // - cooldown

  // Unvested

  public getBalanceSummary(unixTime: BN): BalanceSummary {
    let unvestedBalance = wasm.getUnvestedBalance(
      this.vestingSchedule,
      BigInt(unixTime.toString())
    );
    let currentEpoch = unixTime.div(this.config.epochDuration);
    let unlockingDuration = this.config.unlockingDuration;

    const withdrawable = this.stakeAccountPositionsWasm.getWithdrawable(
      BigInt(this.tokenBalance.toString()),
      unvestedBalance,
      BigInt(currentEpoch.toString()),
      unlockingDuration
    );
    const withdrawableBN = new BN(withdrawable.toString());
    const unvestedBN = new BN(unvestedBalance.toString());
    return {
      withdrawable: withdrawableBN,
      locked: this.tokenBalance.sub(withdrawableBN).sub(unvestedBN),
      unvested: unvestedBN,
    };
  }

  // What is the best way to represent current vesting schedule in the UI
  public getVestingSchedule() {}

  static serializeVesting(lock: VestingSchedule, idl: Idl): Buffer {
    const VESTING_SCHED_MAX_BORSH_LEN = 4 * 8 + 1;
    let buffer = Buffer.alloc(VESTING_SCHED_MAX_BORSH_LEN);

    let idltype = idl.types.find((v) => v.name === "VestingSchedule");
    const vestingSchedLayout = idljs.IdlCoder.typeDefLayout(idltype, idl.types);
    const length = vestingSchedLayout.encode(lock, buffer, 0);
    return buffer.slice(0, length);
  }
}
