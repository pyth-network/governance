import * as anchor from "@project-serum/anchor";
import { parseIdlErrors, Program, Spl } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { expectFail, getTargetAccount } from "./utils/utils";
import BN from "bn.js";
import path from "path";
import { StakeConnection, PythBalance } from "../app";
import {
  readAnchorConfig,
  ANCHOR_CONFIG_PATH,
  standardSetup,
  getPortNumber,
  makeDefaultConfig,
  CustomAbortController,
} from "./utils/before";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("fills a stake account with positions", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let EPOCH_DURATION: BN;

  let program: Program<Staking>;
  let errMap: Map<number, string>;
  let provider: anchor.AnchorProvider;

  let stakeAccountAddress: PublicKey;
  let userAta: PublicKey;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let votingProductMetadataAccount;
  let votingProduct;

  after(async () => {
    controller.abort();
  });
  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));
    program = stakeConnection.program;
    provider = stakeConnection.provider;
    userAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      provider.wallet.publicKey
    );

    errMap = parseIdlErrors(program.idl);
    EPOCH_DURATION = stakeConnection.config.epochDuration;

    votingProduct = stakeConnection.votingProduct;
    votingProductMetadataAccount = await getTargetAccount(
      votingProduct,
      program.programId
    );

    await stakeConnection.depositTokens(
      undefined,
      PythBalance.fromString("102")
    );

    stakeAccountAddress = (
      await stakeConnection.getMainAccount(provider.wallet.publicKey)
    ).address;
  });

  it("creates too many positions", async () => {
    let createPosIx = await program.methods
      .createPosition(votingProduct, PythBalance.fromString("1").toBN())
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .instruction();

    let testTransaction = new Transaction();
    testTransaction.add(createPosIx);
    testTransaction.add(createPosIx);
    const simulationResults = await provider.simulate(testTransaction);
    let costs = [];
    const regex = /consumed (?<consumed>\d+) of (\d+) compute units/;
    for (const logline of simulationResults.logs) {
      const m = logline.match(regex);
      if (m != null) costs.push(parseInt(m.groups["consumed"]));
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
        await provider.sendAndConfirm(transaction, [], {
          skipPreflight: DEBUG,
        });
        transaction = new Transaction();
        budgetRemaining = 200_000;
      }
      transaction.instructions.push(createPosIx);
      budgetRemaining -= ixCost;
      ixCost += deltaCost;
    }

    await provider.sendAndConfirm(transaction, [], {
      skipPreflight: DEBUG,
    });

    // Now create 101, which is supposed to fail
    await expectFail(
      program.methods
        .createPosition(votingProduct, PythBalance.fromString("1").toBN())
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Number of position limit reached",
      errMap
    );
  });
});
