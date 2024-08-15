import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import {
  ComputeBudgetInstruction,
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { expectFail, getTargetAccount } from "./utils/utils";
import path from "path";
import { StakeConnection, PythBalance } from "../app";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
} from "./utils/before";
import { Constants } from "@pythnetwork/staking-wasm";
import { TargetWithParameters } from "../app/StakeConnection";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("fills a stake account with positions", async () => {
  const votingProduct: TargetWithParameters = { voting: {} };

  let program: Program<Staking>;
  let provider: anchor.AnchorProvider;
  let stakeAccountAddress: PublicKey;
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });
  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));
    program = stakeConnection.program;
    provider = stakeConnection.provider;

    await stakeConnection.depositTokens(
      undefined,
      PythBalance.fromString("257")
    );
    stakeAccountAddress = (
      await stakeConnection.getMainAccount(provider.wallet.publicKey)
    ).address;
  });

  it("creates too many positions", async () => {
    let createPosIx = await program.methods
      .createPosition(votingProduct, PythBalance.fromString("1").toBN())
      .accounts({
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

    let budgetRemaining = 1_400_000;
    let ixCost = costs[0];
    let maxInstructions = 10; // Based on txn size
    let deltaCost = costs[1] - costs[0]; // adding more positions increases the cost

    let transaction = new Transaction();
    transaction.instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
    );
    for (let numPositions = 0; numPositions < 255; numPositions++) {
      if (
        budgetRemaining < ixCost ||
        transaction.instructions.length == maxInstructions
      ) {
        await provider.sendAndConfirm(transaction, [], {});
        transaction = new Transaction();
        budgetRemaining = 1_400_000;
      }
      transaction.instructions.push(createPosIx);
      budgetRemaining -= ixCost;
      ixCost += deltaCost;
    }
    await provider.sendAndConfirm(transaction, [], {});

    // Now create 101, which is supposed to fail
    await expectFail(
      program.methods
        .createPosition(votingProduct, PythBalance.fromString("1").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Number of position limit reached"
    );
  });
});
