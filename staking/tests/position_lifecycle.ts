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
import { StakeConnection } from "../app";
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
    await stakeConnection.depositAndLockTokens(undefined, 200);

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    stakeAccountAddress = res[0].address;

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: {locking: new BN(200)} },
      await stakeConnection.getTime()
    );
  });

  it("try to withdraw", async () => {
    expectFail(
      await program.methods.withdrawStake(new BN(101)).accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("try closing a position for more than the position's principal", async () => {
    expectFail(
      await program.methods.closePosition(0, new BN(201)).accounts({
        stakeAccountPositions: stakeAccountAddress,
      }),
      "Amount to unlock bigger than position",
      errMap
    );
  });

  it("close null position", async () => {
    expectFail(
      await program.methods.closePosition(1, new BN(200)).accounts({
        stakeAccountPositions: stakeAccountAddress,
      }),
      "Position not in use",
      errMap
    );
  });

  it("close position instantly", async () => {
    await program.methods
      .closePosition(0, new BN(200))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: new BN(200) },
      await stakeConnection.getTime()
    );
  });

  it("open a new position", async () => {
    await program.methods
      .createPosition(null, null, new BN(200))
      .accounts({
        payer: owner,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: new BN(200) } },
      await stakeConnection.getTime()
    );
  });

  it("first close some", async () => {
    await program.methods
      .closePosition(0, new BN(10))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: {locking: new BN(190)}, withdrawable: new BN(10) },
      await stakeConnection.getTime()
    );
  });

  it("one epoch passes, try closing", async () => {
    await program.methods.advanceClock(EPOCH_DURATION).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: {locked: new BN(190)}, withdrawable: new BN(10) },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, new BN(50))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    // No time has passed, so still locked until the end of the epoch
    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: {locked: new BN(190)}, withdrawable: new BN(10) },
      await stakeConnection.getTime()
    );
  });

  it("two epoch pass, still locked", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(2))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: {locked: new BN(140), unlocking: new BN(50)}, withdrawable: new BN(10) },
      await stakeConnection.getTime()
    );

    expectFail(
      await program.methods.withdrawStake(new BN(11)).accounts({
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
      { locked: {locked: new BN(140)}, withdrawable: new BN(60) },
      await stakeConnection.getTime()
    );

    
    await program.methods
      .closePosition(1, new BN(50))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods
      .closePosition(0, new BN(140))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: {locked: new BN(140)}, withdrawable: new BN(60) },
      await stakeConnection.getTime()
    );

    expectFail(
      await program.methods.withdrawStake(new BN(61)).accounts({
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
      { withdrawable: new BN(200) },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, new BN(140))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: new BN(200) },
      await stakeConnection.getTime()
    );
  });

  it("withdraws everything", async () => {
    await program.methods
      .withdrawStake(new BN(200))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { },
      await stakeConnection.getTime()
    );
  });
});
