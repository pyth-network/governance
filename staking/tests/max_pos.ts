import * as anchor from "@project-serum/anchor";
import { IdlAccounts, IdlTypes, parseIdlErrors, Program, Spl } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
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
import { createMint, expectFail } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../wasm/node/staking";
import path from 'path'
import { readAnchorConfig, ANCHOR_CONFIG_PATH, startValidator, initConfig, requestPythAirdrop, standardSetup, getPortNumber } from "./utils/before";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("fills a stake account with positions", async () => {

  let program: Program<Staking>;

  let voterAccount: PublicKey;
  let errMap: Map<number, string>;

  let provider: anchor.Provider;

  const stake_account_positions_secret = new Keypair();
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zero_pubkey = new PublicKey(0);
  let EPOCH_DURATION: BN;

  let userAta: PublicKey;
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);



  let setupProgram;
  let controller;

  after(async () => {
    controller.abort();
  });
  before(async () => {
    let stakeConnection;
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));
    program = stakeConnection.program;
    provider = stakeConnection.program.provider;
    userAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      program.provider.wallet.publicKey
    );

    errMap = parseIdlErrors(program.idl);
    EPOCH_DURATION = stakeConnection.config.epochDuration;

    const owner = provider.wallet.publicKey;
    const custodyAccount = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
          stake_account_positions_secret.publicKey.toBuffer(),
        ],
        program.programId
      )
    )[0];

    await program.methods
      .createStakeAccount(owner, { fullyVested: {} })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: stake_account_positions_secret.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            wasm.Constants.POSITIONS_ACCOUNT_SIZE()
          ),
          space:  wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
          programId: program.programId,
        }),
      ])
      .postInstructions([
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          userAta,
          custodyAccount,
          provider.wallet.publicKey,
          [],
          102 // So that making 101 positions of size 1 doesn't hit the balance limits
        )
      ])
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
        mint: pythMintAccount.publicKey,
      })
      .signers([stake_account_positions_secret])
      .rpc({
        skipPreflight: DEBUG,
      });
  });


  it("creates too many positions", async () => {
    let createPosIx = await program.methods
      .createPosition(null, null, new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .instruction();
    let testTransaction = new Transaction();
    testTransaction.add(createPosIx);
    testTransaction.add(createPosIx);
    const simulationResults = await provider.simulate(testTransaction);
    let costs = [];
    const regex = /consumed (?<consumed>\d+) of (\d+) compute units/;
    for (const logline of simulationResults.value.logs) {
      const m = logline.match(regex);
      if (m != null)
        costs.push(parseInt(m.groups['consumed']));
    }


    let budgetRemaining = 200_000;
    let ixCost = costs[0];
    let maxInstructions = 10; // Based on txn size
    let deltaCost = costs[1] - costs[0]; // adding more positions increases the cost

    let transaction = new Transaction();
    for (let numPositions = 0; numPositions < 100; numPositions++) {
      if (
        budgetRemaining < ixCost ||
        transaction.instructions.length == maxInstructions
      ) {
        let txHash = await provider.send(transaction, [], {
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
    await provider.send(transaction, [], {
      skipPreflight: DEBUG,
    });

    // Now create 101, which is supposed to fail
    expectFail(
      program.methods
        .createPosition(null, null, new BN(1))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "Number of position limit reached",
      errMap
    );
  });
});
