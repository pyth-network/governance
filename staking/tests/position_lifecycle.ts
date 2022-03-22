import { utils, parseIdlErrors } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { readAnchorConfig, getPortNumber, standardSetup } from "./utils/before";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as wasm from "../wasm/node/staking";
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

  const config = readAnchorConfig("./Anchor.toml");

  let stakeAccountAddress;

  let program;
  let controller;

  let owner: PublicKey;
  let ownerAta: PublicKey;

  let stakeConnection: StakeConnection;
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
  });

  it("deposits tokens and locks", async () => {
    await stakeConnection.depositAndLockTokens(undefined, 200);
    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);

    stakeAccountAddress = res[0].address;

    const beforeBalSummary = res[0].getBalanceSummary(currentTime);
    assert.equal(beforeBalSummary.locked.toNumber(), 200);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 0);
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

  it("try closing a posiiton for more than the positions principal", async () => {
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

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);
    assert.equal(beforeBalSummary.locked.toNumber(), 0);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 200);
  });

  it("open a new position", async () => {
    await program.methods
      .createPosition(null, null, new BN(200))
      .accounts({
        payer: owner,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);
    assert.equal(beforeBalSummary.locked.toNumber(), 200);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 0);
  });

  it("first close some", async () => {
    await program.methods
      .closePosition(0, new BN(10))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);

    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);
    assert.equal(beforeBalSummary.locked.toNumber(), 190);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 10);
  });

  it("one epoch passes, try closing", async () => {
    await program.methods.advanceClock(new BN(3600)).rpc();
    currentTime = currentTime = currentTime.add(new BN(3600));

    await program.methods
      .closePosition(0, new BN(50))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);

    assert.equal(beforeBalSummary.locked.toNumber(), 190);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 10);
  });

  it("three epoch passes, try withdrawing", async () => {
    await program.methods.advanceClock(new BN(3600 * 3)).rpc();
    currentTime = currentTime.add(new BN(3600 * 3));

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

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);

    assert.equal(beforeBalSummary.locked.toNumber(), 140);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 60);

    expectFail(
      await program.methods.withdrawStake(new BN(61)).accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: ownerAta,
      }),
      "Insufficient balance to cover the withdrawal",
      errMap
    );
  });

  it("three epoch passes, complete unlock", async () => {
    await program.methods.advanceClock(new BN(3600 * 3)).rpc();
    currentTime.add(new BN(3600 * 3));

    await program.methods
      .closePosition(0, new BN(140))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);

    assert.equal(beforeBalSummary.locked.toNumber(), 0);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 200);
  });

  it("withdraws everything", async () => {
    await program.methods.withdrawStake(new BN(200)).accounts({
      stakeAccountPositions: stakeAccountAddress,
      destination: ownerAta,
    });

    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 1);
    const beforeBalSummary = res[0].getBalanceSummary(currentTime);

    assert.equal(beforeBalSummary.locked.toNumber(), 0);
    assert.equal(beforeBalSummary.unvested.toNumber(), 0);
    assert.equal(beforeBalSummary.withdrawable.toNumber(), 200);
  });
});
