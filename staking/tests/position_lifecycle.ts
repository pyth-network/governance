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
} from "./utils/before";
import { assertBalanceMatches } from "./utils/api_utils";
import { PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import assert from "assert";
import { StakeConnection, PythBalance } from "../app";
import path from "path";
import { expectFail } from "./utils/utils";

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

  after(async () => {
    controller.abort();
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));
    program = stakeConnection.program;
    owner = stakeConnection.program.provider.wallet.publicKey;

    ownerAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      program.provider.wallet.publicKey
    );

    errMap = parseIdlErrors(program.idl);
    EPOCH_DURATION = stakeConnection.config.epochDuration;
  });

  it("deposits tokens and locks", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("200")
    );

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    stakeAccountAddress = res[0].address;

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
        .closePosition(0, PythBalance.fromString("201").toBN())
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
        .closePosition(1, PythBalance.fromString("200").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Position not in use",
      errMap
    );
  });

  it("close position instantly", async () => {
    await program.methods
      .closePosition(0, PythBalance.fromString("200").toBN())
      .accounts({
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
      .createPosition(null, null, PythBalance.fromString("200").toBN())
      .accounts({
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
      .closePosition(0, PythBalance.fromString("10").toBN())
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);

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
      .closePosition(0, PythBalance.fromString("50").toBN())
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    // No time has passed, so still locked until the end of the epoch
    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("190") },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );
  });

  it("two epoch pass, still locked", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(2))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          locked: PythBalance.fromString("140"),
          unlocking: PythBalance.fromString("50"),
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
      .closePosition(1, PythBalance.fromString("50").toBN())
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods
      .closePosition(0, PythBalance.fromString("140").toBN())
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("140") },
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
      .closePosition(0, PythBalance.fromString("140").toBN())
      .accounts({
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
