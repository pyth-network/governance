import { Provider } from "@project-serum/anchor";
import { TransactionInstruction, Transaction } from "@solana/web3.js";

/** Simulates an instruction and returns it's compute unit cost
 * This function is greatly inspired by 
 * https://github.com/project-serum/anchor/blob/v0.22.0/ts/src/provider.ts
 * We needed to fork because the anchor function wouldn't support
 * disabling signatures, which we need to be able to simulate 
 * a big number of transactions without user approval
 */ 
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

/**
 * Takes the input instructions and returns an array of transaction that 
 * contain the instructions in the same order as provided
 * such that the number of transactions is minimal
 */
export async function batchInstructions(
  ixs: TransactionInstruction[],
  provider: Provider
) : Promise<Transaction[]> {
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
