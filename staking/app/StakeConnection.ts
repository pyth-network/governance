import {
  Program,
  Wallet,
  utils,
  Idl,
  IdlAccounts,
  IdlTypes,
  AnchorProvider,
} from "@coral-xyz/anchor";
import {
  PublicKey,
  Connection,
  Keypair,
  TransactionInstruction,
  Signer,
  Transaction,
  SYSVAR_CLOCK_PUBKEY,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import * as wasm2 from "@pythnetwork/staking-wasm";
import {
  Token,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
import BN from "bn.js";
import * as idljs from "@coral-xyz/anchor/dist/cjs/coder/borsh/idl";
import { Staking } from "../target/types/staking";
import IDL from "../target/idl/staking.json";
import { batchInstructions } from "./transaction";
import { PythBalance } from "./pythBalance";
import {
  getTokenOwnerRecordAddress,
  PROGRAM_VERSION_V2,
  withCreateTokenOwnerRecord,
} from "@solana/spl-governance";
import { GOVERNANCE_ADDRESS, STAKING_ADDRESS } from "./constants";
import assert from "assert";
import { PositionAccountJs } from "./PositionAccountJs";
import * as crypto from "crypto";
let wasm = wasm2;
export { wasm };
interface ClosingItem {
  amount: BN;
  index: number;
}

export type GlobalConfig = IdlAccounts<Staking>["globalConfig"];
type PositionData = IdlAccounts<Staking>["positionData"];
type StakeAccountMetadata = IdlAccounts<Staking>["stakeAccountMetadataV2"];
type VestingSchedule = IdlTypes<Staking>["VestingSchedule"];
type VoterWeightAction = IdlTypes<Staking>["VoterWeightAction"];

export class StakeConnection {
  program: Program<Staking>;
  provider: AnchorProvider;
  config: GlobalConfig;
  configAddress: PublicKey;
  votingProductMetadataAccount: PublicKey;
  votingProduct = { voting: {} };
  governanceAddress: PublicKey;

  private constructor(
    program: Program<Staking>,
    provider: AnchorProvider,
    config: GlobalConfig,
    configAddress: PublicKey,
    votingProductMetadataAccount: PublicKey
  ) {
    this.program = program;
    this.provider = provider;
    this.config = config;
    this.configAddress = configAddress;
    this.votingProductMetadataAccount = votingProductMetadataAccount;
    this.governanceAddress = GOVERNANCE_ADDRESS();
  }

  public static async connect(
    connection: Connection,
    wallet: Wallet
  ): Promise<StakeConnection> {
    return await StakeConnection.createStakeConnection(
      connection,
      wallet,
      STAKING_ADDRESS
    );
  }

  // creates a program connection and loads the staking config
  // the constructor cannot be async so we use a static method
  public static async createStakeConnection(
    connection: Connection,
    wallet: Wallet,
    stakingProgramAddress: PublicKey
  ): Promise<StakeConnection> {
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(
      IDL as Idl,
      stakingProgramAddress,
      provider
    ) as unknown as Program<Staking>;
    // Sometimes in the browser, the import returns a promise.
    // Don't fully understand, but this workaround is not terrible
    if (wasm.hasOwnProperty("default")) {
      wasm = await (wasm as any).default;
    }

    const configAddress = (
      await PublicKey.findProgramAddress(
        [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
        program.programId
      )
    )[0];

    const config = await program.account.globalConfig.fetch(configAddress);

    const votingProductMetadataAccount = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.TARGET_SEED()),
          utils.bytes.utf8.encode(wasm.Constants.VOTING_TARGET_SEED()),
        ],
        program.programId
      )
    )[0];

    return new StakeConnection(
      program,
      provider,
      config,
      configAddress,
      votingProductMetadataAccount
    );
  }

  /** The public key of the user of the staking program. This connection sends transactions as this user. */
  public userPublicKey(): PublicKey {
    return this.provider.wallet.publicKey;
  }

  public async getAllStakeAccountAddresses(): Promise<PublicKey[]> {
    // Use the raw web3.js connection so that anchor doesn't try to borsh deserialize the zero-copy serialized account
    const allAccts = await this.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        encoding: "base64",
        filters: [
          { memcmp: this.program.coder.accounts.memcmp("PositionData") },
        ],
      }
    );
    return allAccts.map((acct) => acct.pubkey);
  }

  /** Gets a users stake accounts */
  public async getStakeAccounts(user: PublicKey): Promise<StakeAccount[]> {
    const res = await this.program.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        encoding: "base64",
        filters: [
          {
            memcmp: this.program.coder.accounts.memcmp("PositionData"),
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

  /** Gets the user's stake account with the most tokens or undefined if it doesn't exist */
  public async getMainAccount(
    user: PublicKey
  ): Promise<StakeAccount | undefined> {
    const accounts = await this.getStakeAccounts(user);
    if (accounts.length == 0) {
      return undefined;
    } else {
      return accounts.reduce(
        (prev: StakeAccount, curr: StakeAccount): StakeAccount => {
          return prev.tokenBalance.lt(curr.tokenBalance) ? curr : prev;
        }
      );
    }
  }

  async fetchVotingProductMetadataAccount() {
    const inbuf = await this.program.provider.connection.getAccountInfo(
      this.votingProductMetadataAccount
    );

    const pm = new wasm.WasmTargetMetadata(inbuf!.data);

    return pm;
  }

  async fetchPositionAccount(address: PublicKey) {
    const inbuf = await this.program.provider.connection.getAccountInfo(
      address
    );
    const stakeAccountPositionsWasm = new wasm.WasmPositionData(inbuf!.data);
    const stakeAccountPositionsJs = new PositionAccountJs(
      inbuf!.data,
      this.program.idl
    );

    return { stakeAccountPositionsWasm, stakeAccountPositionsJs };
  }

  //stake accounts are loaded by a StakeConnection object
  public async loadStakeAccount(address: PublicKey): Promise<StakeAccount> {
    const { stakeAccountPositionsWasm, stakeAccountPositionsJs } =
      await this.fetchPositionAccount(address);

    const metadataAddress = (
      await PublicKey.findProgramAddress(
        [
          utils.bytes.utf8.encode(wasm.Constants.STAKE_ACCOUNT_METADATA_SEED()),
          address.toBuffer(),
        ],
        this.program.programId
      )
    )[0];

    const stakeAccountMetadata =
      (await this.program.account.stakeAccountMetadataV2.fetch(
        metadataAddress
      )) as any as StakeAccountMetadata; // TS complains about types. Not exactly sure why they're incompatible.
    const vestingSchedule = StakeAccount.serializeVesting(
      stakeAccountMetadata.lock,
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

    const authorityAddress = (
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

    const votingAccountMetadataWasm =
      await this.fetchVotingProductMetadataAccount();
    const tokenBalance = (await mint.getAccountInfo(custodyAddress)).amount;
    const totalSupply = (await mint.getMintInfo()).supply;

    return new StakeAccount(
      address,
      stakeAccountPositionsWasm,
      stakeAccountPositionsJs,
      stakeAccountMetadata,
      tokenBalance,
      authorityAddress,
      vestingSchedule,
      votingAccountMetadataWasm,
      totalSupply,
      this.config
    );
  }

  // Gets the current unix time, as would be perceived by the on-chain program
  public async getTime(): Promise<BN> {
    // This is a hack, we are using this deprecated flag to flag whether we are using the mock clock or not
    if (this.config.freeze) {
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
      return new BN(wasm.getUnixTime(clockBuf!.data).toString());
    }
  }

  // Unlock a provided token balance
  public async unlockTokens(stakeAccount: StakeAccount, amount: PythBalance) {
    let lockedSummary = stakeAccount.getBalanceSummary(
      await this.getTime()
    ).locked;
    if (
      amount
        .toBN()
        .gt(lockedSummary.locked.toBN().add(lockedSummary.locking.toBN()))
    ) {
      throw new Error("Amount greater than locked amount.");
    }

    await this.unlockTokensUnchecked(stakeAccount, amount);
  }

  // Unchecked unlock
  public async unlockTokensUnchecked(
    stakeAccount: StakeAccount,
    amount: PythBalance
  ) {
    const positions = stakeAccount.stakeAccountPositionsJs.positions;

    const time = await this.getTime();
    const currentEpoch = time.div(this.config.epochDuration);

    const sortPositions = positions
      .map((value, index) => {
        return { index, value };
      })
      .filter((el) => el.value) // position not null
      .filter(
        (
          el // position is voting
        ) => stakeAccount.stakeAccountPositionsWasm.isPositionVoting(el.index)
      )
      .filter(
        (
          el // position locking or locked
        ) =>
          [wasm.PositionState.LOCKED, wasm.PositionState.LOCKING].includes(
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

    let amountBeforeFinishing: BN = amount.toBN();
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

    const instructions = await Promise.all(
      toClose.map((el) =>
        this.program.methods
          .closePosition(el.index, el.amount, this.votingProduct)
          .accounts({
            targetAccount: this.votingProductMetadataAccount,
            stakeAccountPositions: stakeAccount.address,
          })
          .instruction()
      )
    );

    const transactions = await batchInstructions(
      instructions,
      this.program.provider
    );

    await this.program.provider.sendAll(
      transactions.map((tx) => {
        return { tx, signers: [] };
      })
    );
  }
  public async withUpdateVoterWeight(
    instructions: TransactionInstruction[],
    stakeAccount: StakeAccount,
    action: VoterWeightAction,
    remainingAccount?: PublicKey
  ): Promise<{
    voterWeightAccount: PublicKey;
    maxVoterWeightRecord: PublicKey;
  }> {
    const updateVoterWeightIx = this.program.methods
      .updateVoterWeight(action)
      .accounts({
        stakeAccountPositions: stakeAccount.address,
      })
      .remainingAccounts(
        remainingAccount
          ? [{ pubkey: remainingAccount, isWritable: false, isSigner: false }]
          : []
      );

    instructions.push(await updateVoterWeightIx.instruction());

    return {
      voterWeightAccount: (await updateVoterWeightIx.pubkeys()).voterRecord,
      maxVoterWeightRecord: (
        await this.program.methods.updateMaxVoterWeight().pubkeys()
      ).maxVoterRecord,
    };
  }

  public async withCreateAccount(
    instructions: TransactionInstruction[],
    owner: PublicKey,
    vesting: VestingSchedule = {
      fullyVested: {},
    }
  ): Promise<Keypair> {
    const stakeAccountKeypair = new Keypair();

    instructions.push(
      await this.program.account.positionData.createInstruction(
        stakeAccountKeypair,
        wasm.Constants.POSITIONS_ACCOUNT_SIZE()
      )
    );

    instructions.push(
      await this.program.methods
        .createStakeAccount(owner, vesting)
        .accounts({
          stakeAccountPositions: stakeAccountKeypair.publicKey,
          mint: this.config.pythTokenMint,
        })
        .signers([stakeAccountKeypair])
        .instruction()
    );

    return stakeAccountKeypair;
  }

  public async isLlcMember(stakeAccount: StakeAccount) {
    return (
      JSON.stringify(stakeAccount.stakeAccountMetadata.signedAgreementHash) ==
      JSON.stringify(this.config.agreementHash)
    );
  }

  public async withJoinDaoLlc(
    instructions: TransactionInstruction[],
    stakeAccountAddress: PublicKey
  ) {
    instructions.push(
      await this.program.methods
        .joinDaoLlc(this.config.agreementHash)
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
        })
        .instruction()
    );
  }

  private async buildCloseInstruction(
    stakeAccountPositionsAddress: PublicKey,
    index: number,
    amount: BN
  ): Promise<TransactionInstruction> {
    return await this.program.methods
      .closePosition(index, amount, this.votingProduct)
      .accounts({
        targetAccount: this.votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountPositionsAddress,
      })
      .instruction();
  }

  public async buildTransferInstruction(
    stakeAccountPositionsAddress: PublicKey,
    amount: BN
  ): Promise<TransactionInstruction> {
    const from_account = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      this.config.pythTokenMint,
      this.provider.wallet.publicKey,
      true
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
      this.provider.wallet.publicKey,
      [],
      new u64(amount.toString())
    );

    return ix;
  }

  public async hasGovernanceRecord(user: PublicKey): Promise<boolean> {
    const voterAccountInfo =
      await this.program.provider.connection.getAccountInfo(
        await this.getTokenOwnerRecordAddress(user)
      );

    return Boolean(voterAccountInfo);
  }
  /**
   * Locks all unvested tokens in governance
   */
  public async lockAllUnvested(stakeAccount: StakeAccount) {
    const vestingAccountState = stakeAccount.getVestingAccountState(
      await this.getTime()
    );
    if (
      vestingAccountState !=
        VestingAccountState.UnvestedTokensPartiallyLocked &&
      vestingAccountState != VestingAccountState.UnvestedTokensFullyUnlocked
    ) {
      throw Error(`Unexpected account state ${vestingAccountState}`);
    }

    const balanceSummary = stakeAccount.getBalanceSummary(await this.getTime());
    await this.lockTokens(stakeAccount, balanceSummary.unvested.unlocked);
  }

  /**
   * Locks the specified amount of tokens in governance.
   */
  public async lockTokens(stakeAccount: StakeAccount, amount: PythBalance) {
    const owner: PublicKey = stakeAccount.stakeAccountMetadata.owner;
    const amountBN = amount.toBN();

    const transaction: Transaction = new Transaction();

    if (!(await this.hasGovernanceRecord(owner))) {
      await withCreateTokenOwnerRecord(
        transaction.instructions,
        this.governanceAddress,
        PROGRAM_VERSION_V2,
        this.config.pythGovernanceRealm,
        owner,
        this.config.pythTokenMint,
        owner
      );
    }

    if (!(await this.isLlcMember(stakeAccount))) {
      await this.withJoinDaoLlc(transaction.instructions, stakeAccount.address);
    }

    transaction.instructions.push(
      await this.program.methods
        .createPosition(this.votingProduct, amountBN)
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          targetAccount: this.votingProductMetadataAccount,
        })
        .instruction()
    );

    await this.provider.sendAndConfirm(transaction);
  }

  public async setupVestingAccount(
    amount: PythBalance,
    owner: PublicKey,
    vestingSchedule,
    transfer: boolean = true
  ) {
    const transaction: Transaction = new Transaction();

    const stakeAccountKeypair = await this.withCreateAccount(
      transaction.instructions,
      owner,
      vestingSchedule
    );

    if (transfer) {
      transaction.instructions.push(
        await this.buildTransferInstruction(
          stakeAccountKeypair.publicKey,
          amount.toBN()
        )
      );
    }

    await this.provider.sendAndConfirm(transaction, [stakeAccountKeypair]);
  }

  public async depositTokens(
    stakeAccount: StakeAccount | undefined,
    amount: PythBalance
  ) {
    let stakeAccountAddress: PublicKey;
    const owner = this.provider.wallet.publicKey;

    const ixs: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    if (!stakeAccount) {
      const stakeAccountKeypair = await this.withCreateAccount(ixs, owner);
      signers.push(stakeAccountKeypair);
      stakeAccountAddress = stakeAccountKeypair.publicKey;
    } else {
      stakeAccountAddress = stakeAccount.address;
    }

    if (!(await this.hasGovernanceRecord(owner))) {
      await withCreateTokenOwnerRecord(
        ixs,
        this.governanceAddress,
        PROGRAM_VERSION_V2,
        this.config.pythGovernanceRealm,
        owner,
        this.config.pythTokenMint,
        owner
      );
    }

    if (!stakeAccount || !(await this.isLlcMember(stakeAccount))) {
      await this.withJoinDaoLlc(ixs, stakeAccountAddress);
    }

    ixs.push(
      await this.buildTransferInstruction(stakeAccountAddress, amount.toBN())
    );

    const tx = new Transaction();
    tx.add(...ixs);
    await this.provider.sendAndConfirm(tx, signers);
  }

  public async getTokenOwnerRecordAddress(user: PublicKey) {
    return getTokenOwnerRecordAddress(
      this.governanceAddress,
      this.config.pythGovernanceRealm,
      this.config.pythTokenMint,
      user
    );
  }

  // Unlock all vested tokens and the tokens that will vest in the next vesting event
  public async unlockBeforeVestingEvent(stakeAccount: StakeAccount) {
    const vestingAccountState = stakeAccount.getVestingAccountState(
      await this.getTime()
    );
    if (vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked) {
      throw Error(`Unexpected account state ${vestingAccountState}`);
    }

    const amountBN = stakeAccount.getNetExcessGovernanceAtVesting(
      await this.getTime()
    );

    const amount = new PythBalance(amountBN);
    await this.unlockTokensUnchecked(stakeAccount, amount);
  }

  // Unlock all vested and unvested tokens
  public async unlockAll(stakeAccount: StakeAccount) {
    const vestingAccountState = stakeAccount.getVestingAccountState(
      await this.getTime()
    );
    if (
      vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked &&
      vestingAccountState !=
        VestingAccountState.UnvestedTokensPartiallyLocked &&
      vestingAccountState !=
        VestingAccountState.UnvestedTokensFullyLockedExceptCooldown
    ) {
      throw Error(`Unexpected account state ${vestingAccountState}`);
    }

    const balanceSummary = stakeAccount.getBalanceSummary(await this.getTime());

    const amountBN = balanceSummary.locked.locked
      .toBN()
      .add(balanceSummary.locked.locking.toBN())
      .add(balanceSummary.unvested.locked.toBN())
      .add(balanceSummary.unvested.locking.toBN());

    const amount = new PythBalance(amountBN);
    await this.unlockTokensUnchecked(stakeAccount, amount);
  }

  public async depositAndLockTokens(
    stakeAccount: StakeAccount | undefined,
    amount: PythBalance
  ) {
    let stakeAccountAddress: PublicKey;
    const owner = this.provider.wallet.publicKey;

    const ixs: TransactionInstruction[] = [];
    const signers: Signer[] = [];

    if (!stakeAccount) {
      const stakeAccountKeypair = await this.withCreateAccount(ixs, owner);
      signers.push(stakeAccountKeypair);
      stakeAccountAddress = stakeAccountKeypair.publicKey;
    } else {
      stakeAccountAddress = stakeAccount.address;
      const vestingAccountState = stakeAccount.getVestingAccountState(
        await this.getTime()
      );
      if (
        vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked &&
        vestingAccountState != VestingAccountState.FullyVested
      ) {
        throw Error(`Unexpected account state ${vestingAccountState}`);
      }
    }

    if (!(await this.hasGovernanceRecord(owner))) {
      await withCreateTokenOwnerRecord(
        ixs,
        this.governanceAddress,
        PROGRAM_VERSION_V2,
        this.config.pythGovernanceRealm,
        owner,
        this.config.pythTokenMint,
        owner
      );
    }

    if (!stakeAccount || !(await this.isLlcMember(stakeAccount))) {
      await this.withJoinDaoLlc(ixs, stakeAccountAddress);
    }

    ixs.push(
      await this.buildTransferInstruction(stakeAccountAddress, amount.toBN())
    );

    if (stakeAccount) {
      // Each of these instructions is 27 bytes (<< 1232) so we don't cap how many of them we fit in the transaction
      ixs.push(...(await this.buildCleanupUnlockedPositions(stakeAccount))); // Try to make room by closing unlocked positions
    }
    await this.program.methods
      .createPosition(this.votingProduct, amount.toBN())
      .preInstructions(ixs)
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
        targetAccount: this.votingProductMetadataAccount,
      })
      .signers(signers)
      .rpc({ skipPreflight: true });
  }

  public async buildCleanupUnlockedPositions(
    stakeAccount: StakeAccount
  ): Promise<TransactionInstruction[]> {
    const time = await this.getTime();
    const currentEpoch = time.div(this.config.epochDuration);

    const unlockedPositions = stakeAccount.stakeAccountPositionsJs.positions
      .map((value, index) => {
        return { index, value };
      })
      .filter((el) => el.value) // position not null
      .filter(
        (
          el // position is voting
        ) => stakeAccount.stakeAccountPositionsWasm.isPositionVoting(el.index)
      )
      .filter(
        (
          el // position is unlocked
        ) =>
          stakeAccount.stakeAccountPositionsWasm.getPositionState(
            el.index,
            BigInt(currentEpoch.toString()),
            this.config.unlockingDuration
          ) === wasm.PositionState.UNLOCKED
      )
      .reverse(); // reverse so that earlier deletions don't affect later ones

    return await Promise.all(
      unlockedPositions.map((position) =>
        this.buildCloseInstruction(
          stakeAccount.address,
          position.index,
          position.value.amount
        )
      )
    );
  }

  //withdraw tokens
  public async withdrawTokens(stakeAccount: StakeAccount, amount: PythBalance) {
    if (
      amount
        .toBN()
        .gt(
          stakeAccount
            .getBalanceSummary(await this.getTime())
            .withdrawable.toBN()
        )
    ) {
      throw new Error("Amount exceeds withdrawable.");
    }

    const toAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      this.config.pythTokenMint,
      this.provider.wallet.publicKey,
      true
    );

    const preIxs: TransactionInstruction[] = [];
    if ((await this.provider.connection.getAccountInfo(toAccount)) == null) {
      preIxs.push(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          this.config.pythTokenMint,
          toAccount,
          this.provider.wallet.publicKey,
          this.provider.wallet.publicKey
        )
      );
    }

    await this.program.methods
      .withdrawStake(amount.toBN())
      .preInstructions(preIxs)
      .accounts({
        stakeAccountPositions: stakeAccount.address,
        destination: toAccount,
      })
      .rpc();
  }

  public async requestSplit(
    stakeAccount: StakeAccount,
    amount: PythBalance,
    recipient: PublicKey
  ) {
    const preInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 30000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 30101 }),
    ];
    await this.program.methods
      .requestSplit(amount.toBN(), recipient)
      .preInstructions(preInstructions)
      .accounts({
        stakeAccountPositions: stakeAccount.address,
      })
      .rpc();
  }

  public async getSplitRequest(
    stakeAccount: StakeAccount
  ): Promise<{ balance: PythBalance; recipient: PublicKey } | undefined> {
    const splitRequestAccount = PublicKey.findProgramAddressSync(
      [
        utils.bytes.utf8.encode(wasm.Constants.SPLIT_REQUEST()),
        stakeAccount.address.toBuffer(),
      ],
      this.program.programId
    )[0];
    const splitRequest = await this.program.account.splitRequest.fetchNullable(
      splitRequestAccount
    );

    if (splitRequest) {
      return {
        balance: new PythBalance(splitRequest.amount),
        recipient: splitRequest.recipient,
      };
    } else {
      return undefined;
    }
  }

  public async acceptSplit(
    stakeAccount: StakeAccount,
    amount: PythBalance,
    recipient: PublicKey
  ) {
    const instructions = [];
    const nonce = crypto.randomUUID();
    const ephemeralAccount = await PublicKey.createWithSeed(
      this.userPublicKey(),
      nonce,
      this.program.programId
    );
    instructions.push(
      SystemProgram.createAccountWithSeed({
        fromPubkey: this.userPublicKey(),
        newAccountPubkey: ephemeralAccount,
        basePubkey: this.userPublicKey(),
        seed: nonce,
        lamports:
          await this.program.provider.connection.getMinimumBalanceForRentExemption(
            wasm.Constants.POSITIONS_ACCOUNT_SIZE()
          ),
        space: wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
        programId: this.program.programId,
      })
    );

    await this.program.methods
      .acceptSplit(amount.toBN(), recipient)
      .accounts({
        sourceStakeAccountPositions: stakeAccount.address,
        newStakeAccountPositions: ephemeralAccount,
        mint: this.config.pythTokenMint,
      })
      .signers([])
      .preInstructions(instructions)
      .rpc();
  }
}

export interface BalanceSummary {
  withdrawable: PythBalance;
  // We may break this down into active, warmup, and cooldown in the future
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

export enum VestingAccountState {
  FullyVested,
  UnvestedTokensFullyLocked,
  UnvestedTokensFullyLockedExceptCooldown,
  UnvestedTokensPartiallyLocked,
  UnvestedTokensFullyUnlockedExceptCooldown,
  UnvestedTokensFullyUnlocked,
}

export class StakeAccount {
  address: PublicKey;
  stakeAccountPositionsWasm: any;
  stakeAccountPositionsJs: PositionAccountJs;
  stakeAccountMetadata: StakeAccountMetadata;
  tokenBalance: u64;
  authorityAddress: PublicKey;
  vestingSchedule: Buffer; // Borsh serialized
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
  ) {
    this.address = address;
    this.stakeAccountPositionsWasm = stakeAccountPositionsWasm;
    this.stakeAccountPositionsJs = stakeAccountPositionsJs;
    this.stakeAccountMetadata = stakeAccountMetadata;
    this.tokenBalance = tokenBalance;
    this.authorityAddress = authorityAddress;
    this.vestingSchedule = vestingSchedule;
    this.votingAccountMetadataWasm = votingAccountMetadataWasm;
    this.totalSupply = totalSupply;
    this.config = config;
  }

  // Withdrawable

  //Locked tokens :
  // - warmup
  // - active
  // - cooldown

  // Unvested

  public getBalanceSummary(unixTime: BN): BalanceSummary {
    let unvestedBalance = wasm.getUnvestedBalance(
      this.vestingSchedule,
      BigInt(unixTime.toString()),
      this.config.pythTokenListTime
        ? BigInt(this.config.pythTokenListTime.toString())
        : undefined
    );

    let currentEpoch = unixTime.div(this.config.epochDuration);
    let unlockingDuration = this.config.unlockingDuration;
    let currentEpochBI = BigInt(currentEpoch.toString());

    let withdrawable: BigInt;
    try {
      withdrawable = this.stakeAccountPositionsWasm.getWithdrawable(
        BigInt(this.tokenBalance.toString()),
        unvestedBalance,
        currentEpochBI,
        unlockingDuration
      );
    } catch (e) {
      throw Error(
        "This account has less tokens than the unlocking schedule or your staking position requires. Please contact support."
      );
    }

    const withdrawableBN = new BN(withdrawable.toString());
    const unvestedBN = new BN(unvestedBalance.toString());
    const lockedSummaryBI =
      this.stakeAccountPositionsWasm.getLockedBalanceSummary(
        currentEpochBI,
        unlockingDuration
      );

    let lockingBN = new BN(lockedSummaryBI.locking.toString());
    let lockedBN = new BN(lockedSummaryBI.locked.toString());
    let preunlockingBN = new BN(lockedSummaryBI.preunlocking.toString());
    let unlockingBN = new BN(lockedSummaryBI.unlocking.toString());

    // For the user it makes sense that all the categories add up to the number of tokens in their custody account
    // This sections corrects the locked balances to achieve this invariant
    let excess = lockingBN
      .add(lockedBN)
      .add(preunlockingBN)
      .add(unlockingBN)
      .add(withdrawableBN)
      .add(unvestedBN)
      .sub(this.tokenBalance);

    let lockedUnvestedBN: BN,
      lockingUnvestedBN: BN,
      preUnlockingUnvestedBN: BN,
      unlockingUnvestedBN: BN;

    // First adjust locked. Most of the time, the unvested tokens are in this state.
    [excess, lockedBN, lockedUnvestedBN] = this.adjustLockedAmount(
      excess,
      lockedBN
    );

    // The unvested tokens can also be in a locking state at the very beginning.
    // The reason why we adjust this balance second is the following
    // If a user has 100 unvested in a locked position and decides to stake 1 free token
    // we want that token to appear as locking
    [excess, lockingBN, lockingUnvestedBN] = this.adjustLockedAmount(
      excess,
      lockingBN
    );

    // Needed to represent vesting accounts unlocking before the vesting event
    [excess, preunlockingBN, preUnlockingUnvestedBN] = this.adjustLockedAmount(
      excess,
      preunlockingBN
    );
    [excess, unlockingBN, unlockingUnvestedBN] = this.adjustLockedAmount(
      excess,
      unlockingBN
    );

    //Enforce the invariant
    assert(
      lockingBN
        .add(lockedBN)
        .add(preunlockingBN)
        .add(unlockingBN)
        .add(withdrawableBN)
        .add(unvestedBN)
        .eq(this.tokenBalance)
    );

    return {
      // withdrawable tokens
      withdrawable: new PythBalance(withdrawableBN),
      // vested tokens not currently withdrawable
      locked: {
        locking: new PythBalance(lockingBN),
        locked: new PythBalance(lockedBN),
        unlocking: new PythBalance(unlockingBN),
        preunlocking: new PythBalance(preunlockingBN),
      },
      // unvested tokens
      unvested: {
        total: new PythBalance(unvestedBN),
        locked: new PythBalance(lockedUnvestedBN),
        locking: new PythBalance(lockingUnvestedBN),
        unlocking: new PythBalance(unlockingUnvestedBN),
        preunlocking: new PythBalance(preUnlockingUnvestedBN),
        unlocked: new PythBalance(
          unvestedBN
            .sub(lockedUnvestedBN)
            .sub(lockingUnvestedBN)
            .sub(unlockingUnvestedBN)
            .sub(preUnlockingUnvestedBN)
        ),
      },
    };
  }

  private adjustLockedAmount(excess: BN, locked: BN) {
    if (excess.gt(new BN(0))) {
      if (excess.gte(locked)) {
        return [excess.sub(locked), new BN(0), locked];
      } else {
        return [new BN(0), locked.sub(excess), excess];
      }
    } else {
      return [new BN(0), locked, new BN(0)];
    }
  }

  public getVoterWeight(unixTime: BN): PythBalance {
    let currentEpoch = unixTime.div(this.config.epochDuration);
    let unlockingDuration = this.config.unlockingDuration;

    const voterWeightBI = this.stakeAccountPositionsWasm.getVoterWeight(
      BigInt(currentEpoch.toString()),
      unlockingDuration,
      BigInt(
        this.votingAccountMetadataWasm.getCurrentAmountLocked(
          BigInt(currentEpoch.toString())
        )
      )
    );

    return new PythBalance(new BN(voterWeightBI.toString()));
  }

  public getNextVesting(unixTime: BN) {
    return wasm.getNextVesting(
      this.vestingSchedule,
      BigInt(unixTime.toString()),
      this.config.pythTokenListTime
        ? BigInt(this.config.pythTokenListTime.toString())
        : undefined
    );
  }

  static serializeVesting(lock: VestingSchedule, idl: Idl): Buffer {
    const VESTING_SCHED_MAX_BORSH_LEN = 4 * 8 + 1;
    let buffer = Buffer.alloc(VESTING_SCHED_MAX_BORSH_LEN);

    let idltype = idl?.types?.find((v) => v.name === "VestingSchedule");
    const vestingSchedLayout = idljs.IdlCoder.typeDefLayout(
      idltype!,
      idl.types
    );
    const length = vestingSchedLayout.encode(lock, buffer, 0);
    return buffer.slice(0, length);
  }

  public getVestingAccountState(unixTime: BN): VestingAccountState {
    const vestingSummary = this.getBalanceSummary(unixTime).unvested;
    if (vestingSummary.total.isZero()) {
      return VestingAccountState.FullyVested;
    }
    if (
      vestingSummary.preunlocking.isZero() &&
      vestingSummary.unlocking.isZero()
    ) {
      if (vestingSummary.locked.isZero() && vestingSummary.locking.isZero()) {
        return VestingAccountState.UnvestedTokensFullyUnlocked;
      } else if (vestingSummary.unlocked.isZero()) {
        return VestingAccountState.UnvestedTokensFullyLocked;
      } else {
        return VestingAccountState.UnvestedTokensPartiallyLocked;
      }
    } else {
      if (vestingSummary.locked.isZero() && vestingSummary.locking.isZero()) {
        return VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown;
      } else if (vestingSummary.unlocked.isZero()) {
        return VestingAccountState.UnvestedTokensFullyLockedExceptCooldown;
      } else {
        return VestingAccountState.UnvestedTokensPartiallyLocked;
      }
    }
  }

  private addUnlockingPeriod(unixTime: BN) {
    return unixTime.add(
      this.config.epochDuration.mul(
        new BN(this.config.unlockingDuration).add(new BN(1))
      )
    );
  }

  public getNetExcessGovernanceAtVesting(unixTime: BN): BN {
    const nextVestingEvent = this.getNextVesting(unixTime);
    if (!nextVestingEvent) {
      return new BN(0);
    }
    const nextVestingEventTimeBn = new BN(nextVestingEvent.time.toString());
    const timeOfEval = BN.max(
      nextVestingEventTimeBn,
      this.addUnlockingPeriod(unixTime)
    );

    const balanceSummary = this.getBalanceSummary(timeOfEval).locked;
    return balanceSummary.locking.toBN().add(balanceSummary.locked.toBN());
  }
}
