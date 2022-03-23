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
import { amountNumberToBn } from "../app/StakeConnection";

const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("position_lifecycle", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let decimals;

  let errMap: Map<number, string>;

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  let EPOCH_DURATION: BN;
  let stakeAccountAddress;

  let program;
  let controller;

  let owner: PublicKey;
  let ownerAta: PublicKey;

  let stakeConnection: StakeConnection;

  // Time is recorded manually until we implement a new StakeConnection function to get the current time
  // that @ptaffet is working on
  let currentTime = new BN(10);

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
      { locked: 200, unvested: 0, withdrawable: 0 },
      currentTime
    );
  });

  it("try to withdraw", async () => {
    await expectFail(
      program.methods.withdrawStake(new BN(101)).accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("try closing a position for more than the position's principal", async () => {
    await expectFail(
      program.methods.closePosition(0, amountNumberToBn(201,stakeConnection.getDecimals())).accounts({
        stakeAccountPositions: stakeAccountAddress,
      }),
      "Amount to unlock bigger than position",
      errMap
    );
  });

  it("close null position", async () => {
    await expectFail(
      program.methods.closePosition(1, new BN(200)).accounts({
        stakeAccountPositions: stakeAccountAddress,
      }),
      "Position not in use",
      errMap
    );
  });

  it("close position instantly", async () => {
    await program.methods
      .closePosition(0, amountNumberToBn(200,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 0, unvested: 0, withdrawable: 200 },
      currentTime
    );
  });

  it("open a new position", async () => {
    await program.methods
      .createPosition(null, null, amountNumberToBn(200,stakeConnection.getDecimals()))
      .accounts({
        payer: owner,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 200, unvested: 0, withdrawable: 0 },
      currentTime
    );
  });

  it("first close some", async () => {
    await program.methods
      .closePosition(0, amountNumberToBn(10,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 190, unvested: 0, withdrawable: 10 },
      currentTime
    );
  });

  it("one epoch passes, try closing", async () => {
    await program.methods.advanceClock(EPOCH_DURATION).rpc();
    currentTime = currentTime.add(EPOCH_DURATION);

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 190, unvested: 0, withdrawable: 10 },
      currentTime
    );

    await program.methods
      .closePosition(0, amountNumberToBn(50,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 190, unvested: 0, withdrawable: 10 },
      currentTime
    );
  });

  it("two epoch pass, still locked", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(2))).rpc();
    currentTime = currentTime.add(EPOCH_DURATION.mul(new BN(2)));

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 190, unvested: 0, withdrawable: 10 },
      currentTime
    );

    await expectFail(
      program.methods.withdrawStake(amountNumberToBn(11,stakeConnection.getDecimals())).accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );

  });

  it("one epoch pass, try withdrawing", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(1))).rpc();
    currentTime = currentTime.add(EPOCH_DURATION.mul(new BN(1)));

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 140, unvested: 0, withdrawable: 60 },
      currentTime
    );

    await program.methods
      .closePosition(1, amountNumberToBn(50,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods
      .closePosition(0, amountNumberToBn(140,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 140, unvested: 0, withdrawable: 60 },
      currentTime
    );

    await expectFail(
      program.methods.withdrawStake(amountNumberToBn(61,stakeConnection.getDecimals())).accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("three epoch pass, complete unlock", async () => {
    await program.methods.advanceClock(EPOCH_DURATION.mul(new BN(3))).rpc();
    currentTime = currentTime.add(EPOCH_DURATION.mul(new BN(3)));

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 0, unvested: 0, withdrawable: 200 },
      currentTime
    );

    await program.methods
      .closePosition(0, amountNumberToBn(140,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 0, unvested: 0, withdrawable: 200 },
      currentTime
    );
  });

  it("withdraws everything", async () => {
    await program.methods
      .withdrawStake(amountNumberToBn(200,stakeConnection.getDecimals()))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: 0, unvested: 0, withdrawable: 0 },
      currentTime
    );
  });
});
