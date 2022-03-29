import { Provider } from "@project-serum/anchor";
import { TransactionInstruction, Transaction } from "@solana/web3.js";
import { Test } from "mocha";

async function simulateInstruction(
  ix: TransactionInstruction,
  provider: Provider
): Promise<number> {
  let testTransaction = new Transaction();
  testTransaction.add(ix);

  // @ts-ignore
  testTransaction.recentBlockhash = await provider.connection._recentBlockhash(
    // @ts-ignore
    provider.connection._disableBlockhashCaching
  );

  testTransaction.feePayer = provider.wallet.publicKey;

  const signData = testTransaction.serializeMessage();
  // @ts-ignore
  const wireTransaction = testTransaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString("base64");

  const config: any = { encoding: "base64", commitment: provider.opts.commitment };
  const args = [encodedTransaction, config];

  // @ts-ignore
  const simulation = await provider.connection._rpcRequest("simulateTransaction", args);
  const simulationResults = simulation.result;

  const regex = /consumed (?<consumed>\d+) of (\d+) compute units/;
  for (const logline of simulationResults.value.logs) {
    const m = logline.match(regex);
    if (m != null) return parseInt(m.groups["consumed"]);
  }
}

export async function batchInstructions(
  ixs: TransactionInstruction[],
  provider: Provider
) {
  let budgetRemaining = 200_000;
  const transactions: Transaction[] = [];
  let transaction = new Transaction();
  for (let instruction of ixs) {
    const ixCost = await simulateInstruction(instruction, provider);

    if (ixCost < budgetRemaining) {
      //transaction fits
      transaction.add(instruction);
      budgetRemaining -= ixCost;
    } else {
      // instruction does not fit
      transactions.push(transaction);
      transaction = new Transaction();
      transaction.add(instruction);
      budgetRemaining = 200_000 - ixCost;
    }
  }

  transactions.push(transaction); // last transaction needs to get pushed

  return transactions;
}
