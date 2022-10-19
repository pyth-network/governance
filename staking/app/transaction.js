"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchInstructions = void 0;
const web3_js_1 = require("@solana/web3.js");
const MAX_INSTRUCTIONS_PER_TRANSACTION = 10;
/**
 * Takes the input instructions and returns an array of transactions that
 * contains all of the instructions with `MAX_INSTRUCTION_PER_TRANSACTION`
 * instructions per transaction
 */
function batchInstructions(ixs, provider) {
    return __awaiter(this, void 0, void 0, function* () {
        const transactions = [];
        for (let i = 0; i < ixs.length; i += MAX_INSTRUCTIONS_PER_TRANSACTION) {
            let transaction = new web3_js_1.Transaction();
            transaction.add(...ixs.slice(i, i + MAX_INSTRUCTIONS_PER_TRANSACTION));
            transactions.push(transaction); // last transaction needs to get pushed
        }
        return transactions;
    });
}
exports.batchInstructions = batchInstructions;
