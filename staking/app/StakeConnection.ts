import {
  Provider,
  Program,
  Wallet,
  utils,
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
  Transaction,
  SYSVAR_CLOCK_PUBKEY,
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
import assert from "assert"

interface ClosingItem {
  amount: BN;
  index: number;
}

type GlobalConfig = IdlAccounts<Staking>["globalConfig"];
type PositionData = IdlAccounts<Staking>["positionData"];
type Position = IdlTypes<Staking>["Position"];
type StakeAccountMetadata = IdlAccounts<Staking>["stakeAccountMetadata"];
type VestingSchedule = IdlTypes<Staking>["VestingSchedule"];

export class StakeConnection {
  program: Program<Staking>;
  config: GlobalConfig;
  private configAddress: PublicKey;

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
    stakeConnection.configAddress = configAddress;

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

  // Gets the current unix time, as would be perceived by the on-chain program
  public async getTime() : Promise<BN> {
    if ('mockClockTime' in this.config) {
      // On chain program using mock clock, so get that time
      const updatedConfig = await this.program.account.globalConfig.fetch(
        this.configAddress
      );
      return updatedConfig.mockClockTime;
    } else {
      // Using Sysvar clock
      const clockBuf = await this.program.provider.connection.getAccountInfo(
        SYSVAR_CLOCK_PUBKEY
      );
      return new BN(wasm.getUnixTime(clockBuf.data).toString());
    }
  }

  // Unlock a provided token balance
  // If amount requested to unlock bigger the locked amount, we will close all positions
  public async unlockTokens(stakeAccount: StakeAccount, amount: BN) {

    assert(stakeAccount.getBalanceSummary(await this.getTime()).locked.gte(amount));

    const positions = stakeAccount.stakeAccountPositionsJs
      .positions as Position[];

    const time = await this.getTime();
    const currentEpoch = time.div(this.config.epochDuration);

    const sortPositions = positions
      .map((value, index) => {
        return { index, value };
      })
      .filter((el) => el.value) // position not null
      .filter((el) => // position is voting
        stakeAccount.stakeAccountPositionsWasm.isPositionVoting(
          el.index,
          BigInt(currentEpoch.toString()),
          this.config.unlockingDuration
        
      )
    ) 
      .filter((el) => // position locking or locked 
        [1,2].includes(
          stakeAccount.stakeAccountPositionsWasm.getPositionState(
            el.index,
            BigInt(currentEpoch.toString()),
            this.config.unlockingDuration
          )
        )
      ) 
      .sort(
        (a, b) => (a.value.activationEpoch.gt(b.value.activationEpoch) ? 1 : -1) // FIFO closing
      );

    let amountBeforeFinishing = amount;
    let i = 0;
    const toClose: ClosingItem[] = [];

    while (amountBeforeFinishing.gt(new BN(0)) && i < sortPositions.length) {
      if (sortPositions[i].value.amount.gte(amountBeforeFinishing)) {
        toClose.push({
          index: sortPositions[i].index,
          amount: amountBeforeFinishing,
        });
        amountBeforeFinishing = new BN(0);
      } else {
        toClose.push({
          index: sortPositions[i].index,
          amount: sortPositions[i].value.amount,
        });
        amountBeforeFinishing = amountBeforeFinishing.sub(
          sortPositions[i].value.amount
        );
      }
      i++; 
    }
    
    for (let el of toClose) {
      await this.program.methods
        .closePosition(el.index, el.amount)
        .accounts({
          stakeAccountPositions: stakeAccount.address,
        })
        .rpc();
    }
  }

  private async withCreateAccount(
    instructions: TransactionInstruction[],
    owner: PublicKey
  ): Promise<Keypair> {
    const stakeAccountKeypair = new Keypair();

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
      await this.program.methods
        .createStakeAccount(this.program.provider.wallet.publicKey, {
          fullyVested: {},
        })
        .accounts({
          stakeAccountPositions: stakeAccountKeypair.publicKey,
          mint: this.config.pythTokenMint,
        })
        .signers([stakeAccountKeypair])
        .instruction()
    );

    return stakeAccountKeypair;
  }

  private async buildCloseInstruction(
    stakeAccountPositionsAddress: PublicKey,
    index: number,
    amount: BN
  ) {
    return await this.program.methods
      .closePosition(index, amount)
      .accounts({
        stakeAccountPositions: stakeAccountPositionsAddress,
      })
      .rpc();
  }

  private async buildTransferInstruction(
    stakeAccountPositionsAddress: PublicKey,
    amount: number
  ): Promise<TransactionInstruction> {
    const from_account = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      this.config.pythTokenMint,
      this.program.provider.wallet.publicKey
    );

    const toAccount = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
          stakeAccountPositionsAddress.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from_account,
      toAccount,
      this.program.provider.wallet.publicKey,
      [],
      amount
    );

    return ix;
  }

  public async depositTokens(
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

    ixs.push(await this.buildTransferInstruction(stakeAccountAddress, amount));

    const tx = new Transaction();
    tx.add(...ixs);
    await this.program.provider.send(tx, []);
  }

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

    ixs.push(await this.buildTransferInstruction(stakeAccountAddress, amount));

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
