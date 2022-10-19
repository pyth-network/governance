import { Provider } from "@project-serum/anchor";
import { TransactionInstruction, Transaction } from "@solana/web3.js";
/**
 * Takes the input instructions and returns an array of transactions that
 * contains all of the instructions with `MAX_INSTRUCTION_PER_TRANSACTION`
 * instructions per transaction
 */
export declare function batchInstructions(
  ixs: TransactionInstruction[],
  provider: Provider
): Promise<Transaction[]>;
