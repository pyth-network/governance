import * as anchor from "@project-serum/anchor";
import toml from "toml";
import {
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  startValidator,
  createMint,
  requestPythAirdrop,
  createStakeAccount,
  initConfig,
  depositTokens,
} from "./utils/before";
import {
  PublicKey,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import * as wasm from "../wasm/node/staking";
import BN from "bn.js";
import assert from "assert";
import fs from "fs";
import { expect_fail } from "./utils/utils";

const portNumber = 8907;
const DEBUG = false;

describe("create_stake_account", async () => {
  const CONFIG_SEED = "config";
  const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
  const CUSTODY_SEED = "custody";
  const AUTHORITY_SEED = "authority";
  const VOTER_SEED = "voter_weight";

  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zeroPubkey = new PublicKey(0);

  const stakeAccountPositionSecret = new Keypair();

  const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

  let program;
  let controller;

  let owner;

  let errMap: Map<number, string>;

  after(async () => {
    controller.abort();
  });

  before(async () => {
    ({ controller, program } = await startValidator(portNumber, config));

    owner = program.provider.wallet.publicKey;
    errMap = anchor.parseIdlErrors(program.idl);

    await createMint(
      program.provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    await requestPythAirdrop(
      owner,
      pythMintAccount.publicKey,
      pythMintAuthority,
      200,
      program.provider.connection
    );

    await initConfig(program, pythMintAccount.publicKey);

    await createStakeAccount(
      program,
      stakeAccountPositionSecret,
      pythMintAccount.publicKey
    );

    await depositTokens(
      program,
      stakeAccountPositionSecret.publicKey,
      pythMintAccount.publicKey,
      101
    );
  });

  it("creates a position that's too big", async () => {
    expect_fail(
      program.methods
        .createPosition(zeroPubkey, zeroPubkey, new BN(102))
        .accounts({
          stakeAccountPositions: stakeAccountPositionSecret.publicKey,
        }),
      "Insufficient balance to take on a new position",
      errMap
    );
  });

  it("creates a position", async () => {
    const tx = await program.methods
      .createPosition(null, null, new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountPositionSecret.publicKey,
      })
      .rpc({
        skipPreflight: DEBUG,
      });
  });

  it("validates position", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(
      stakeAccountPositionSecret.publicKey
    );
    const outbuffer = Buffer.alloc(10 * 1024);
    wasm.convert_positions_account(inbuf.data, outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);

    // TODO: Once we merge the mock clock branch and control the activationEpoch, replace with struct equality
    assert.equal(
      positions.positions[0].amount.toNumber(),
      new BN(1).toNumber()
    );
    assert.equal(positions.positions[0].product, null);
    assert.equal(positions.positions[0].publisher, null);
    assert.equal(positions.positions[0].unlockingStart, null);
    for (let index = 1; index < positions.positions.length; index++) {
      assert.equal(positions.positions[index], null);
    }
  });

  it("creates position with 0 principal", async () => {
    expect_fail(
      program.methods
        .createPosition(zeroPubkey, zeroPubkey, new BN(0))
        .accounts({
          stakeAccountPositions: stakeAccountPositionSecret.publicKey,
        }),
      "New position needs to have positive balance",
      errMap
    );
  });

  it("creates too many positions", async () => {
    let createPosIx = await program.methods
      .createPosition(zeroPubkey, zeroPubkey, new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountPositionSecret.publicKey,
      })
      .instruction();

    // We are starting with 1 position and want to create 99 more
    let budgetRemaining = 200_000;
    let ixCost = 19100;
    let maxInstructions = 10; // Based on txn size
    let deltaCost = 510; // adding more positions increases the cost

    let transaction = new Transaction();
    for (let numPositions = 0; numPositions < 99; numPositions++) {
      if (
        budgetRemaining < ixCost ||
        transaction.instructions.length == maxInstructions
      ) {
        let txHash = await program.provider.send(transaction, [], {
          skipPreflight: DEBUG,
        });
        transaction = new Transaction();
        budgetRemaining = 200_000;
      }
      transaction.instructions.push(createPosIx);
      budgetRemaining -= ixCost;
      ixCost += deltaCost;
    }
    await program.provider.send(transaction, [], {
      skipPreflight: DEBUG,
    });

    // Now create 101, which is supposed to fail
    expect_fail(
      program.methods
        .createPosition(zeroPubkey, zeroPubkey, new BN(1))
        .accounts({
          stakeAccountPositions: stakeAccountPositionSecret.publicKey,
        }),
      "Number of position limit reached",
      errMap
    );
  });
});
