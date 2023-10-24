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
import { BN, Wallet } from "@project-serum/anchor";
import { assertBalanceMatches } from "./utils/api_utils";
import assert from "assert";
import { blob } from "stream/consumers";

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

  let sam = new Keypair();
  let samConnection: StakeConnection;

  let alice = new Keypair();

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

    samConnection = await StakeConnection.createStakeConnection(
      stakeConnection.provider.connection,
      new Wallet(sam),
      stakeConnection.program.programId
    );

    pdaConnection = await StakeConnection.createStakeConnection(
      stakeConnection.provider.connection,
      new Wallet(pdaAuthority),
      stakeConnection.program.programId
    );
  });

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

  it("request split", async () => {
    await pdaConnection.provider.connection.requestAirdrop(
      pdaAuthority.publicKey,
      1_000_000_000_000
    );

    let stakeAccount = await samConnection.getMainAccount(sam.publicKey);
    await samConnection.requestSplit(
      stakeAccount,
      PythBalance.fromString("33"),
      alice.publicKey
    );

    await pdaConnection.acceptSplit(stakeAccount);

    let sourceStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    let newStakeAccount = await samConnection.getMainAccount(alice.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        sourceStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locking: PythBalance.fromString("67"),
        },
      },
      await samConnection.getTime()
    );

    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        newStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      alice.publicKey,
      {
        unvested: {
          locking: PythBalance.fromString("33"),
        },
      },
      await samConnection.getTime()
    );
  });

  after(async () => {
    controller.abort();
  });
});
