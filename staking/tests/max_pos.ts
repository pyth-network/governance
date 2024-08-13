import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getTargetAccount } from "./utils/utils";
import path from "path";
import { StakeConnection, PythBalance } from "../app";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
} from "./utils/before";
import { TargetWithParameters } from "../app/StakeConnection";
import { abortUnlessDetached } from "./utils/after";
import assert from "assert";

const portNumber = getPortNumber(path.basename(__filename));

describe("fills a stake account with positions", async () => {
  const votingProduct: TargetWithParameters = { voting: {} };

  let program: Program<Staking>;
  let provider: anchor.AnchorProvider;
  let stakeAccountAddress: PublicKey;
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;
  let votingProductMetadataAccount: PublicKey;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });
  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));
    program = stakeConnection.program;
    provider = stakeConnection.provider;

    votingProductMetadataAccount = await getTargetAccount(program.programId);

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
    for (let numPositions = 0; numPositions < 20; numPositions++) {
      if (
        budgetRemaining < ixCost ||
        transaction.instructions.length == maxInstructions
      ) {
        await provider.sendAndConfirm(transaction, [], {});
        await assertPositionsAccountLength(
          provider.connection,
          stakeAccountAddress,
          numPositions
        );
        transaction = new Transaction();
        budgetRemaining = 200_000;
      }
      transaction.instructions.push(createPosIx);
      budgetRemaining -= ixCost;
      ixCost += deltaCost;
    }
    await provider.sendAndConfirm(transaction, [], {});
    await assertPositionsAccountLength(
      provider.connection,
      stakeAccountAddress,
      20
    );

    // Can create more
    await program.methods
      .createPosition(votingProduct, PythBalance.fromString("1").toBN())
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();
  });
  await assertPositionsAccountLength(
    provider.connection,
    stakeAccountAddress,
    21
  );
});

async function assertPositionsAccountLength(
  connection: Connection,
  stakeAccountAddress: PublicKey,
  numPositions: number
) {
  const stakeAccount = await connection.getAccountInfo(stakeAccountAddress);
  assert(stakeAccount.data.length == 40 + 200 * numPositions);
}
