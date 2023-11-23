import { Provider } from "@coral-xyz/anchor";
import { TransactionInstruction, Transaction } from "@solana/web3.js";

const MAX_INSTRUCTIONS_PER_TRANSACTION = 10;

/**
 * Takes the input instructions and returns an array of transactions that
 * contains all of the instructions with `MAX_INSTRUCTION_PER_TRANSACTION`
 * instructions per transaction
 */
export async function batchInstructions(
  ixs: TransactionInstruction[],
  provider: Provider
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];
  for (let i = 0; i < ixs.length; i += MAX_INSTRUCTIONS_PER_TRANSACTION) {
    let transaction = new Transaction();
    transaction.add(...ixs.slice(i, i + MAX_INSTRUCTIONS_PER_TRANSACTION));
    transactions.push(transaction); // last transaction needs to get pushed
  }
  return transactions;
}
