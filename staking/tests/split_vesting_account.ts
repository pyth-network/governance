import {
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  getPortNumber,
  makeDefaultConfig,
  readAnchorConfig,
  requestPythAirdrop,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { StakeConnection, PythBalance, VestingAccountState } from "../app";
import { ErrorCode, BN, Wallet, AnchorError } from "@project-serum/anchor";
import {
  assertBalanceMatches,
  OptionalBalanceSummary,
} from "./utils/api_utils";
import assert from "assert";
import { blob } from "stream/consumers";
import { Key } from "@metaplex-foundation/mpl-token-metadata";

const ONE_MONTH = new BN(3600 * 24 * 30.5);
const portNumber = getPortNumber(path.basename(__filename));

describe("split vesting account", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let owner: PublicKey;

  let pdaAuthority = new Keypair();
  let pdaConnection: StakeConnection;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(
        pythMintAccount.publicKey,
        PublicKey.unique(),
        pdaAuthority.publicKey
      )
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.provider.wallet.publicKey;

    pdaConnection = await connect(pdaAuthority);
  });

  /** Create a stake connection for a keypair and airdrop the key some SOL so it can send transactions. */
  async function connect(keypair: Keypair): Promise<StakeConnection> {
    let connection = await StakeConnection.createStakeConnection(
      stakeConnection.provider.connection,
      new Wallet(keypair),
      stakeConnection.program.programId
    );

    await connection.provider.connection.requestAirdrop(
      keypair.publicKey,
      1_000_000_000_000
    );

    return connection;
  }

  async function setupSplit(
    totalBalance: string,
    vestingInitialBalance: string,
    lockedBalance: string
  ): Promise<[StakeConnection, StakeConnection]> {
    let samConnection = await connect(new Keypair());

    await samConnection.provider.connection.requestAirdrop(
      samConnection.userPublicKey(),
      1_000_000_000_000
    );
    await requestPythAirdrop(
      samConnection.userPublicKey(),
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString(totalBalance),
      samConnection.provider.connection
    );

    const transaction = new Transaction();

    const stakeAccountKeypair = await samConnection.withCreateAccount(
      transaction.instructions,
      samConnection.userPublicKey(),
      {
        periodicVesting: {
          initialBalance: PythBalance.fromString(vestingInitialBalance).toBN(),
          startDate: await stakeConnection.getTime(),
          periodDuration: ONE_MONTH,
          numPeriods: new BN(72),
        },
      }
    );

    await samConnection.withJoinDaoLlc(
      transaction.instructions,
      stakeAccountKeypair.publicKey
    );

    transaction.instructions.push(
      await samConnection.buildTransferInstruction(
        stakeAccountKeypair.publicKey,
        PythBalance.fromString(totalBalance).toBN()
      )
    );

    await samConnection.provider.sendAndConfirm(
      transaction,
      [stakeAccountKeypair],
      { skipPreflight: true }
    );

    let stakeAccount = await samConnection.getMainAccount(
      samConnection.userPublicKey()
    );
    assert(
      VestingAccountState.UnvestedTokensFullyUnlocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      samConnection.userPublicKey(),
      {
        unvested: {
          unlocked: PythBalance.fromString(vestingInitialBalance),
        },
      },
      await samConnection.getTime()
    );

    await samConnection.lockTokens(
      stakeAccount,
      PythBalance.fromString(lockedBalance)
    );

    let aliceConnection = await connect(new Keypair());
    return [samConnection, aliceConnection];
  }

  async function assertMainAccountBalance(
    samConnection: StakeConnection,
    expectedState: VestingAccountState,
    expectedBalance: OptionalBalanceSummary
  ) {
    let sourceStakeAccount = await samConnection.getMainAccount(
      samConnection.userPublicKey()
    );

    assert(
      expectedState ==
        sourceStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      samConnection.userPublicKey(),
      expectedBalance,
      await samConnection.getTime()
    );
  }

  async function assertFailsWithErrorCode(
    thunk: () => Promise<void>,
    errorCode: string
  ) {
    let actualErrorCode: string | undefined = undefined;
    try {
      await thunk();
    } catch (err) {
      if (err instanceof AnchorError) {
        actualErrorCode = err.error.errorCode.code;
      }
    }

    assert.equal(
      actualErrorCode,
      errorCode,
      `Call did not fail with the expected error code.`
    );
  }

  /*
  it("create a vesting account", async () => {
    await samConnection.provider.connection.requestAirdrop(
      sam.publicKey,
      1_000_000_000_000
    );
    await requestPythAirdrop(
      sam.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("200"),
      samConnection.provider.connection
    );

    const transaction = new Transaction();

    const stakeAccountKeypair = await samConnection.withCreateAccount(
      transaction.instructions,
      sam.publicKey,
      {
        periodicVesting: {
          initialBalance: PythBalance.fromString("100").toBN(),
          startDate: await stakeConnection.getTime(),
          periodDuration: ONE_MONTH,
          numPeriods: new BN(72),
        },
      }
    );

    await samConnection.withJoinDaoLlc(
      transaction.instructions,
      stakeAccountKeypair.publicKey
    );

    transaction.instructions.push(
      await samConnection.buildTransferInstruction(
        stakeAccountKeypair.publicKey,
        PythBalance.fromString("100").toBN()
      )
    );

    await samConnection.provider.sendAndConfirm(
      transaction,
      [stakeAccountKeypair],
      { skipPreflight: true }
    );

    let stakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyUnlocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("100"),
        },
      },
      await samConnection.getTime()
    );

    await samConnection.lockAllUnvested(stakeAccount);
  });
   */

  it("split/accept flow success", async () => {
    let [samConnection, aliceConnection] = await setupSplit("100", "100", "0");

    let stakeAccount = await samConnection.getMainAccount(
      samConnection.userPublicKey()
    );

    await samConnection.requestSplit(
      stakeAccount,
      PythBalance.fromString("33"),
      aliceConnection.userPublicKey()
    );

    await pdaConnection.acceptSplit(
      stakeAccount,
      PythBalance.fromString("33"),
      aliceConnection.userPublicKey()
    );

    await assertMainAccountBalance(
      samConnection,
      VestingAccountState.UnvestedTokensFullyUnlocked,
      {
        unvested: {
          unlocked: PythBalance.fromString("67"),
        },
      }
    );
    await assertMainAccountBalance(
      aliceConnection,
      VestingAccountState.UnvestedTokensFullyUnlocked,
      {
        unvested: {
          unlocked: PythBalance.fromString("33"),
        },
      }
    );
  });

  it("split/accept flow fails if account has locked tokens", async () => {
    let [samConnection, aliceConnection] = await setupSplit("100", "100", "1");

    let stakeAccount = await samConnection.getMainAccount(
      samConnection.userPublicKey()
    );

    await samConnection.requestSplit(
      stakeAccount,
      PythBalance.fromString("33"),
      aliceConnection.userPublicKey()
    );

    await assertFailsWithErrorCode(
      () =>
        pdaConnection.acceptSplit(
          stakeAccount,
          PythBalance.fromString("33"),
          aliceConnection.userPublicKey()
        ),
      "SplitWithStake"
    );

    await assertMainAccountBalance(
      samConnection,
      VestingAccountState.UnvestedTokensPartiallyLocked,
      {
        unvested: {
          unlocked: PythBalance.fromString("99"),
          locking: PythBalance.fromString("1"),
        },
      }
    );
  });

  it("split/accept flow fails if accept has mismatched args", async () => {
    let [samConnection, aliceConnection] = await setupSplit("100", "100", "0");

    let stakeAccount = await samConnection.getMainAccount(
      samConnection.userPublicKey()
    );

    await samConnection.requestSplit(
      stakeAccount,
      PythBalance.fromString("33"),
      aliceConnection.userPublicKey()
    );

    // wrong balance
    await assertFailsWithErrorCode(
      () =>
        pdaConnection.acceptSplit(
          stakeAccount,
          PythBalance.fromString("34"),
          aliceConnection.userPublicKey()
        ),
      "InvalidApproval"
    );

    // wrong recipient
    await assertFailsWithErrorCode(
      () =>
        pdaConnection.acceptSplit(
          stakeAccount,
          PythBalance.fromString("33"),
          samConnection.userPublicKey()
        ),
      "InvalidApproval"
    );

    // wrong signer
    await assertFailsWithErrorCode(
      () =>
        aliceConnection.acceptSplit(
          stakeAccount,
          PythBalance.fromString("33"),
          aliceConnection.userPublicKey()
        ),
      "ConstraintAddress"
    );
  });

  after(async () => {
    controller.abort();
  });
});
