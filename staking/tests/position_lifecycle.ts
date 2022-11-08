import { parseIdlErrors } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  readAnchorConfig,
  getPortNumber,
  standardSetup,
  ANCHOR_CONFIG_PATH,
  makeDefaultConfig,
} from "./utils/before";
import { assertBalanceMatches } from "./utils/api_utils";
import { PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import assert from "assert";
import { StakeConnection, PythBalance } from "../app";
import path from "path";
import { expectFail, getTargetAccount } from "./utils/utils";

const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("position_lifecycle", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let errMap: Map<number, string>;

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  let EPOCH_DURATION: BN;
  let stakeAccountAddress;

  let program;
  let controller;

  let owner: PublicKey;
  let ownerAta: PublicKey;

  let stakeConnection: StakeConnection;

  let votingProductMetadataAccount;
  let votingProduct;

  after(async () => {
    controller.abort();
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));
    program = stakeConnection.program;
    owner = stakeConnection.provider.wallet.publicKey;

    ownerAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      program.provider.wallet.publicKey
    );

    errMap = parseIdlErrors(program.idl);
    EPOCH_DURATION = stakeConnection.config.epochDuration;

    votingProduct = stakeConnection.votingProduct;
    votingProductMetadataAccount = await getTargetAccount(
      votingProduct,
      program.programId
    );
  });

  it("deposits tokens and locks", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("200")
    );

    stakeAccountAddress = (await stakeConnection.getMainAccount(owner)).address;

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("200") } },
      await stakeConnection.getTime()
    );
  });

  it("try to withdraw", async () => {
    expectFail(
      await program.methods
        .withdrawStake(PythBalance.fromString("101").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("try closing a position for more than the position's principal", async () => {
    expectFail(
      await program.methods
        .closePosition(0, PythBalance.fromString("201").toBN(), votingProduct)
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Amount to unlock bigger than position",
      errMap
    );
  });

  it("close null position", async () => {
    expectFail(
      await program.methods
        .closePosition(1, PythBalance.fromString("200").toBN(), votingProduct)
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Position not in use",
      errMap
    );
  });

  it("close position instantly", async () => {
    await program.methods
      .closePosition(0, PythBalance.fromString("200").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  it("open a new position", async () => {
    await program.methods
      .createPosition(votingProduct, PythBalance.fromString("200").toBN())
      .accounts({
        targetAccount: votingProductMetadataAccount,
        payer: owner,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("200") } },
      await stakeConnection.getTime()
    );
  });

  it("first close some", async () => {
    await program.methods
      .closePosition(0, PythBalance.fromString("10").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("190") },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );
  });

  it("one epoch passes, try closing", async () => {
    await program.methods.advanceClock(EPOCH_DURATION).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("190") },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, PythBalance.fromString("50").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    // No time has passed, so preunlocking until the end of the epoch
    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          locked: PythBalance.fromString("140"),
          preunlocking: PythBalance.fromString("50"),
        },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );
  });

  it("one epoch pass, still locked", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(0))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          locked: PythBalance.fromString("140"),
          preunlocking: PythBalance.fromString("50"),
        },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );

    expectFail(
      await program.methods
        .withdrawStake(PythBalance.fromString("11").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("one epoch pass, try withdrawing", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(1))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("140") },
        withdrawable: PythBalance.fromString("60"),
      },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(1, PythBalance.fromString("50").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods
      .closePosition(0, PythBalance.fromString("140").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    // Make sure than closing a position twice fails
    await expectFail(
      await program.methods
        .closePosition(0, PythBalance.fromString("140").toBN(), votingProduct)
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Position already unlocking",
      errMap
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { preunlocking: PythBalance.fromString("140") },
        withdrawable: PythBalance.fromString("60"),
      },
      await stakeConnection.getTime()
    );

    expectFail(
      await program.methods
        .withdrawStake(PythBalance.fromString("61").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("three epoch pass, complete unlock", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(3))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, PythBalance.fromString("140").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  it("another iteration", async () => {
    await program.methods
      .createPosition(votingProduct, PythBalance.fromString("100").toBN())
      .accounts({
        targetAccount: votingProductMetadataAccount,
        payer: owner,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("100"),
      },
      await stakeConnection.getTime()
    );

    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(1))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("100"),
      },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, PythBalance.fromString("100").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(2))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  it("withdraws everything", async () => {
    await program.methods
      .withdrawStake(PythBalance.fromString("200").toBN())
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {},
      await stakeConnection.getTime()
    );
  });
});
