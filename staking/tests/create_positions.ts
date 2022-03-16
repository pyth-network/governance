import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import { positions_account_size } from "./utils/constant";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { expect_fail } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../wasm/node/staking";
import fs from "fs";
import { depositTokensInstruction, createStakeAccount } from "./utils/utils";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;

describe("create_positions", async () => {
  let program: Program<Staking>;

  let config_account: PublicKey;
  let bump: number;

  let errMap: Map<number, string>;

  const CONFIG_SEED = "config";
  const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
  const CUSTODY_SEED = "custody";
  const AUTHORITY_SEED = "authority";
  const VOTER_SEED = "voter_weight";

  const stake_account_positions_secret = new Keypair();

  let pyth_mint_account;
  let pyth_mint_authority;
  const zero_pubkey = new PublicKey(0);

  let user_ata;

  before(async () => {
    program = anchor.workspace.Staking as Program<Staking>;

    [config_account, bump] = await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode(CONFIG_SEED)],
      program.programId
    );

    while (true) {
      try {
        console.log("waiting");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await program.account.globalConfig.fetch(config_account);
        break;
      } catch (e) {}
    }

    pyth_mint_account = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(fs.readFileSync("./tests/pyth_mint_account.json").toString())
      )
    );

    pyth_mint_authority = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(
          fs.readFileSync("./tests/pyth_mint_authority.json").toString()
        )
      )
    );

    user_ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      program.provider.wallet.publicKey
    );

    errMap = anchor.parseIdlErrors(program.idl);
  });

  it("setup", async () => {
    await createStakeAccount(
      program,
      stake_account_positions_secret,
      pyth_mint_account.publicKey
    );

    const transaction = new Transaction();
    const ix = await depositTokensInstruction(
      program,
      stake_account_positions_secret.publicKey,
      pyth_mint_account.publicKey,
      101
    );
    transaction.add(ix);
    const tx = await program.provider.send(transaction, [], {
      skipPreflight: DEBUG,
    });
  });

  it("parses positions", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(
      stake_account_positions_secret.publicKey
    );
    const outbuffer = Buffer.alloc(10 * 1024);
    wasm.convert_positions_account(inbuf.data, outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);
    for (let index = 0; index < positions.positions.length; index++) {
      assert.equal(positions.positions[index], null);
    }
  });

  it("creates a position that's too big", async () => {
    expect_fail(
      program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(102))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "Insufficient balance to take on a new position",
      errMap
    );
  });

  it("creates a position", async () => {
    const tx = await program.methods
      .createPosition(null, null, new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .rpc({
        skipPreflight: DEBUG,
      });
  });

  it("validates position", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(
      stake_account_positions_secret.publicKey
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
        .createPosition(zero_pubkey, zero_pubkey, new BN(0))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "New position needs to have positive balance",
      errMap
    );
  });

  it("creates too many positions", async () => {
    let createPosIx = await program.methods
      .createPosition(zero_pubkey, zero_pubkey, new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
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
        console.log(numPositions, txHash);
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
        .createPosition(zero_pubkey, zero_pubkey, new BN(1))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "Number of position limit reached",
      errMap
    );
  });
});
