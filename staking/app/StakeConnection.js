"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakeAccount = exports.VestingAccountState = exports.StakeConnection = exports.wasm = void 0;
const anchor_1 = require("@project-serum/anchor");
const web3_js_1 = require("@solana/web3.js");
const wasm2 = __importStar(require("pyth-staking-wasm"));
const spl_token_1 = require("@solana/spl-token");
const bn_js_1 = __importDefault(require("bn.js"));
const idljs = __importStar(require("@project-serum/anchor/dist/cjs/coder/borsh/idl"));
const transaction_1 = require("./transaction");
const pythBalance_1 = require("./pythBalance");
const spl_governance_1 = require("@solana/spl-governance");
const constants_1 = require("./constants");
const assert_1 = __importDefault(require("assert"));
const PositionAccountJs_1 = require("./PositionAccountJs");
let wasm = wasm2;
exports.wasm = wasm;
class StakeConnection {
    constructor(program, provider, config, configAddress, votingProductMetadataAccount) {
        this.votingProduct = { voting: {} };
        this.program = program;
        this.provider = provider;
        this.config = config;
        this.configAddress = configAddress;
        this.votingProductMetadataAccount = votingProductMetadataAccount;
        this.governanceAddress =
            program.provider.connection.rpcEndpoint === constants_1.LOCALNET_ENDPOINT
                ? constants_1.LOCALNET_GOVERNANCE_ADDRESS
                : program.provider.connection.rpcEndpoint === constants_1.DEVNET_ENDPOINT
                    ? constants_1.DEVNET_GOVERNANCE_ADDRESS
                    : constants_1.MAINNET_GOVERNANCE_ADDRESS;
    }
    // creates a program connection and loads the staking config
    // the constructor cannot be async so we use a static method
    static createStakeConnection(connection, wallet, stakingProgramAddress) {
        return __awaiter(this, void 0, void 0, function* () {
            const provider = new anchor_1.AnchorProvider(connection, wallet, {});
            const idl = (yield anchor_1.Program.fetchIdl(stakingProgramAddress, provider));
            const program = new anchor_1.Program(idl, stakingProgramAddress, provider);
            // Sometimes in the browser, the import returns a promise.
            // Don't fully understand, but this workaround is not terrible
            if (wasm.hasOwnProperty("default")) {
                exports.wasm = wasm = yield wasm.default;
            }
            const configAddress = (yield web3_js_1.PublicKey.findProgramAddress([anchor_1.utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())], program.programId))[0];
            const config = yield program.account.globalConfig.fetch(configAddress);
            const votingProductMetadataAccount = (yield web3_js_1.PublicKey.findProgramAddress([
                anchor_1.utils.bytes.utf8.encode(wasm.Constants.TARGET_SEED()),
                anchor_1.utils.bytes.utf8.encode(wasm.Constants.VOTING_TARGET_SEED()),
            ], program.programId))[0];
            return new StakeConnection(program, provider, config, configAddress, votingProductMetadataAccount);
        });
    }
    getAllStakeAccountAddresses() {
        return __awaiter(this, void 0, void 0, function* () {
            // Use the raw web3.js connection so that anchor doesn't try to borsh deserialize the zero-copy serialized account
            const allAccts = yield this.provider.connection.getProgramAccounts(this.program.programId, {
                encoding: "base64",
                filters: [
                    { memcmp: this.program.coder.accounts.memcmp("PositionData") },
                ],
            });
            return allAccts.map((acct) => acct.pubkey);
        });
    }
    /** Gets a users stake accounts */
    getStakeAccounts(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.program.provider.connection.getProgramAccounts(this.program.programId, {
                encoding: "base64",
                filters: [
                    {
                        memcmp: this.program.coder.accounts.memcmp("PositionData"),
                    },
                    {
                        memcmp: {
                            offset: 8,
                            bytes: user.toBase58(),
                        },
                    },
                ],
            });
            return yield Promise.all(res.map((account) => __awaiter(this, void 0, void 0, function* () {
                return yield this.loadStakeAccount(account.pubkey);
            })));
        });
    }
    /** Gets the user's stake account with the most tokens or undefined if it doesn't exist */
    getMainAccount(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const accounts = yield this.getStakeAccounts(user);
            if (accounts.length == 0) {
                return undefined;
            }
            else {
                return accounts.reduce((prev, curr) => {
                    return prev.tokenBalance.lt(curr.tokenBalance) ? curr : prev;
                });
            }
        });
    }
    fetchVotingProductMetadataAccount() {
        return __awaiter(this, void 0, void 0, function* () {
            const inbuf = yield this.program.provider.connection.getAccountInfo(this.votingProductMetadataAccount);
            const pm = new wasm.WasmTargetMetadata(inbuf.data);
            return pm;
        });
    }
    fetchPositionAccount(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const inbuf = yield this.program.provider.connection.getAccountInfo(address);
            const stakeAccountPositionsWasm = new wasm.WasmPositionData(inbuf.data);
            const stakeAccountPositionsJs = new PositionAccountJs_1.PositionAccountJs(inbuf.data, this.program.idl);
            return { stakeAccountPositionsWasm, stakeAccountPositionsJs };
        });
    }
    //stake accounts are loaded by a StakeConnection object
    loadStakeAccount(address) {
        return __awaiter(this, void 0, void 0, function* () {
            const { stakeAccountPositionsWasm, stakeAccountPositionsJs } = yield this.fetchPositionAccount(address);
            const metadataAddress = (yield web3_js_1.PublicKey.findProgramAddress([
                anchor_1.utils.bytes.utf8.encode(wasm.Constants.STAKE_ACCOUNT_METADATA_SEED()),
                address.toBuffer(),
            ], this.program.programId))[0];
            const stakeAccountMetadata = (yield this.program.account.stakeAccountMetadataV2.fetch(metadataAddress)); // TS complains about types. Not exactly sure why they're incompatible.
            const vestingSchedule = StakeAccount.serializeVesting(stakeAccountMetadata.lock, this.program.idl);
            const custodyAddress = (yield web3_js_1.PublicKey.findProgramAddress([
                anchor_1.utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
                address.toBuffer(),
            ], this.program.programId))[0];
            const authorityAddress = (yield web3_js_1.PublicKey.findProgramAddress([
                anchor_1.utils.bytes.utf8.encode(wasm.Constants.AUTHORITY_SEED()),
                address.toBuffer(),
            ], this.program.programId))[0];
            const mint = new spl_token_1.Token(this.program.provider.connection, this.config.pythTokenMint, spl_token_1.TOKEN_PROGRAM_ID, new web3_js_1.Keypair());
            const votingAccountMetadataWasm = yield this.fetchVotingProductMetadataAccount();
            const tokenBalance = (yield mint.getAccountInfo(custodyAddress)).amount;
            const totalSupply = (yield mint.getMintInfo()).supply;
            return new StakeAccount(address, stakeAccountPositionsWasm, stakeAccountPositionsJs, stakeAccountMetadata, tokenBalance, authorityAddress, vestingSchedule, votingAccountMetadataWasm, totalSupply, this.config);
        });
    }
    // Gets the current unix time, as would be perceived by the on-chain program
    getTime() {
        return __awaiter(this, void 0, void 0, function* () {
            // The Idl contains mockClockTime even when we build it with mock-clock feature disabled.
            // Therefore if the field doesn't exist it gets parsed as 0.
            // Thus, if mockClockTime is 0 we need to use real time.
            if ("mockClockTime" in this.config && this.config.mockClockTime.gtn(0)) {
                // On chain program using mock clock, so get that time
                const updatedConfig = yield this.program.account.globalConfig.fetch(this.configAddress);
                return updatedConfig.mockClockTime;
            }
            else {
                // Using Sysvar clock
                const clockBuf = yield this.program.provider.connection.getAccountInfo(web3_js_1.SYSVAR_CLOCK_PUBKEY);
                return new bn_js_1.default(wasm.getUnixTime(clockBuf.data).toString());
            }
        });
    }
    // Unlock a provided token balance
    unlockTokens(stakeAccount, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            let lockedSummary = stakeAccount.getBalanceSummary(yield this.getTime()).locked;
            if (amount
                .toBN()
                .gt(lockedSummary.locked.toBN().add(lockedSummary.locking.toBN()))) {
                throw new Error("Amount greater than locked amount.");
            }
            yield this.unlockTokensUnchecked(stakeAccount, amount);
        });
    }
    // Unchecked unlock
    unlockTokensUnchecked(stakeAccount, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const positions = stakeAccount.stakeAccountPositionsJs.positions;
            const time = yield this.getTime();
            const currentEpoch = time.div(this.config.epochDuration);
            const sortPositions = positions
                .map((value, index) => {
                return { index, value };
            })
                .filter((el) => el.value) // position not null
                .filter((el // position is voting
            ) => stakeAccount.stakeAccountPositionsWasm.isPositionVoting(el.index))
                .filter((el // position locking or locked
            ) => [wasm.PositionState.LOCKED, wasm.PositionState.LOCKING].includes(stakeAccount.stakeAccountPositionsWasm.getPositionState(el.index, BigInt(currentEpoch.toString()), this.config.unlockingDuration)))
                .sort((a, b) => (a.value.activationEpoch.gt(b.value.activationEpoch) ? 1 : -1) // FIFO closing
            );
            let amountBeforeFinishing = amount.toBN();
            let i = 0;
            const toClose = [];
            while (amountBeforeFinishing.gt(new bn_js_1.default(0)) && i < sortPositions.length) {
                if (sortPositions[i].value.amount.gte(amountBeforeFinishing)) {
                    toClose.push({
                        index: sortPositions[i].index,
                        amount: amountBeforeFinishing,
                    });
                    amountBeforeFinishing = new bn_js_1.default(0);
                }
                else {
                    toClose.push({
                        index: sortPositions[i].index,
                        amount: sortPositions[i].value.amount,
                    });
                    amountBeforeFinishing = amountBeforeFinishing.sub(sortPositions[i].value.amount);
                }
                i++;
            }
            const instructions = yield Promise.all(toClose.map((el) => this.program.methods
                .closePosition(el.index, el.amount, this.votingProduct)
                .accounts({
                targetAccount: this.votingProductMetadataAccount,
                stakeAccountPositions: stakeAccount.address,
            })
                .instruction()));
            const transactions = yield (0, transaction_1.batchInstructions)(instructions, this.program.provider);
            yield this.program.provider.sendAll(transactions.map((tx) => {
                return { tx, signers: [] };
            }));
        });
    }
    withUpdateVoterWeight(instructions, stakeAccount, action, remainingAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            const updateVoterWeightIx = this.program.methods
                .updateVoterWeight(action)
                .accounts({
                stakeAccountPositions: stakeAccount.address,
            })
                .remainingAccounts(remainingAccount
                ? [{ pubkey: remainingAccount, isWritable: false, isSigner: false }]
                : []);
            instructions.push(yield updateVoterWeightIx.instruction());
            return {
                voterWeightAccount: (yield updateVoterWeightIx.pubkeys()).voterRecord,
                maxVoterWeightRecord: (yield this.program.methods.updateMaxVoterWeight().pubkeys()).maxVoterRecord,
            };
        });
    }
    withCreateAccount(instructions, owner, vesting = {
        fullyVested: {},
    }) {
        return __awaiter(this, void 0, void 0, function* () {
            const stakeAccountKeypair = new web3_js_1.Keypair();
            instructions.push(yield this.program.account.positionData.createInstruction(stakeAccountKeypair, wasm.Constants.POSITIONS_ACCOUNT_SIZE()));
            instructions.push(yield this.program.methods
                .createStakeAccount(owner, vesting)
                .accounts({
                stakeAccountPositions: stakeAccountKeypair.publicKey,
                mint: this.config.pythTokenMint,
            })
                .signers([stakeAccountKeypair])
                .instruction());
            return stakeAccountKeypair;
        });
    }
    buildCloseInstruction(stakeAccountPositionsAddress, index, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.program.methods
                .closePosition(index, amount, this.votingProduct)
                .accounts({
                targetAccount: this.votingProductMetadataAccount,
                stakeAccountPositions: stakeAccountPositionsAddress,
            })
                .rpc();
        });
    }
    buildTransferInstruction(stakeAccountPositionsAddress, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            const from_account = yield spl_token_1.Token.getAssociatedTokenAddress(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, this.config.pythTokenMint, this.provider.wallet.publicKey);
            const toAccount = (yield web3_js_1.PublicKey.findProgramAddress([
                anchor_1.utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
                stakeAccountPositionsAddress.toBuffer(),
            ], this.program.programId))[0];
            const ix = spl_token_1.Token.createTransferInstruction(spl_token_1.TOKEN_PROGRAM_ID, from_account, toAccount, this.provider.wallet.publicKey, [], new spl_token_1.u64(amount.toString()));
            return ix;
        });
    }
    hasGovernanceRecord(user) {
        return __awaiter(this, void 0, void 0, function* () {
            const voterAccountInfo = yield this.program.provider.connection.getAccountInfo(yield this.getTokenOwnerRecordAddress(user));
            return Boolean(voterAccountInfo);
        });
    }
    /**
     * Locks all unvested tokens in governance
     */
    lockAllUnvested(stakeAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            const vestingAccountState = stakeAccount.getVestingAccountState(yield this.getTime());
            if (vestingAccountState !=
                VestingAccountState.UnvestedTokensPartiallyLocked &&
                vestingAccountState != VestingAccountState.UnvestedTokensFullyUnlocked) {
                throw Error(`Unexpected account state ${vestingAccountState}`);
            }
            const owner = stakeAccount.stakeAccountMetadata.owner;
            const balanceSummary = stakeAccount.getBalanceSummary(yield this.getTime());
            const amountBN = balanceSummary.unvested.unlocked.toBN();
            const transaction = new web3_js_1.Transaction();
            if (!(yield this.hasGovernanceRecord(owner))) {
                yield (0, spl_governance_1.withCreateTokenOwnerRecord)(transaction.instructions, this.governanceAddress, spl_governance_1.PROGRAM_VERSION_V2, this.config.pythGovernanceRealm, owner, this.config.pythTokenMint, owner);
            }
            transaction.instructions.push(yield this.program.methods
                .createPosition(this.votingProduct, amountBN)
                .accounts({
                stakeAccountPositions: stakeAccount.address,
                targetAccount: this.votingProductMetadataAccount,
            })
                .instruction());
            yield this.provider.sendAndConfirm(transaction);
        });
    }
    setupVestingAccount(amount, owner, vestingSchedule) {
        return __awaiter(this, void 0, void 0, function* () {
            const transaction = new web3_js_1.Transaction();
            //Forgive me, I didn't find a better way to check the enum variant
            (0, assert_1.default)(vestingSchedule.periodicVesting);
            (0, assert_1.default)(vestingSchedule.periodicVesting.initialBalance);
            (0, assert_1.default)(vestingSchedule.periodicVesting.initialBalance.lte(amount.toBN()));
            const stakeAccountKeypair = yield this.withCreateAccount(transaction.instructions, owner, vestingSchedule);
            transaction.instructions.push(yield this.buildTransferInstruction(stakeAccountKeypair.publicKey, amount.toBN()));
            yield this.provider.sendAndConfirm(transaction, [stakeAccountKeypair]);
        });
    }
    depositTokens(stakeAccount, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            let stakeAccountAddress;
            const owner = this.provider.wallet.publicKey;
            const ixs = [];
            const signers = [];
            if (!stakeAccount) {
                const stakeAccountKeypair = yield this.withCreateAccount(ixs, owner);
                signers.push(stakeAccountKeypair);
                stakeAccountAddress = stakeAccountKeypair.publicKey;
            }
            else {
                stakeAccountAddress = stakeAccount.address;
            }
            if (!(yield this.hasGovernanceRecord(owner))) {
                yield (0, spl_governance_1.withCreateTokenOwnerRecord)(ixs, this.governanceAddress, spl_governance_1.PROGRAM_VERSION_V2, this.config.pythGovernanceRealm, owner, this.config.pythTokenMint, owner);
            }
            ixs.push(yield this.buildTransferInstruction(stakeAccountAddress, amount.toBN()));
            const tx = new web3_js_1.Transaction();
            tx.add(...ixs);
            yield this.provider.sendAndConfirm(tx, signers);
        });
    }
    getTokenOwnerRecordAddress(user) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, spl_governance_1.getTokenOwnerRecordAddress)(this.governanceAddress, this.config.pythGovernanceRealm, this.config.pythTokenMint, user);
        });
    }
    // Unlock all vested tokens and the tokens that will vest in the next vesting event
    unlockBeforeVestingEvent(stakeAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            const vestingAccountState = stakeAccount.getVestingAccountState(yield this.getTime());
            if (vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked) {
                throw Error(`Unexpected account state ${vestingAccountState}`);
            }
            const amountBN = stakeAccount.getNetExcessGovernanceAtVesting(yield this.getTime());
            const amount = new pythBalance_1.PythBalance(amountBN);
            yield this.unlockTokensUnchecked(stakeAccount, amount);
        });
    }
    // Unlock all vested and unvested tokens
    unlockAll(stakeAccount) {
        return __awaiter(this, void 0, void 0, function* () {
            const vestingAccountState = stakeAccount.getVestingAccountState(yield this.getTime());
            if (vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked &&
                vestingAccountState !=
                    VestingAccountState.UnvestedTokensPartiallyLocked &&
                vestingAccountState !=
                    VestingAccountState.UnvestedTokensFullyLockedExceptCooldown) {
                throw Error(`Unexpected account state ${vestingAccountState}`);
            }
            const balanceSummary = stakeAccount.getBalanceSummary(yield this.getTime());
            const amountBN = balanceSummary.locked.locked
                .toBN()
                .add(balanceSummary.locked.locking.toBN())
                .add(balanceSummary.unvested.locked.toBN())
                .add(balanceSummary.unvested.locking.toBN());
            const amount = new pythBalance_1.PythBalance(amountBN);
            yield this.unlockTokensUnchecked(stakeAccount, amount);
        });
    }
    depositAndLockTokens(stakeAccount, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            let stakeAccountAddress;
            const owner = this.provider.wallet.publicKey;
            const ixs = [];
            const signers = [];
            if (!stakeAccount) {
                const stakeAccountKeypair = yield this.withCreateAccount(ixs, owner);
                signers.push(stakeAccountKeypair);
                stakeAccountAddress = stakeAccountKeypair.publicKey;
            }
            else {
                stakeAccountAddress = stakeAccount.address;
                const vestingAccountState = stakeAccount.getVestingAccountState(yield this.getTime());
                if (vestingAccountState != VestingAccountState.UnvestedTokensFullyLocked &&
                    vestingAccountState != VestingAccountState.FullyVested) {
                    throw Error(`Unexpected account state ${vestingAccountState}`);
                }
            }
            if (!(yield this.hasGovernanceRecord(owner))) {
                yield (0, spl_governance_1.withCreateTokenOwnerRecord)(ixs, this.governanceAddress, spl_governance_1.PROGRAM_VERSION_V2, this.config.pythGovernanceRealm, owner, this.config.pythTokenMint, owner);
            }
            ixs.push(yield this.buildTransferInstruction(stakeAccountAddress, amount.toBN()));
            yield this.program.methods
                .createPosition(this.votingProduct, amount.toBN())
                .preInstructions(ixs)
                .accounts({
                stakeAccountPositions: stakeAccountAddress,
                targetAccount: this.votingProductMetadataAccount,
            })
                .signers(signers)
                .rpc({ skipPreflight: true });
        });
    }
    //withdraw tokens
    withdrawTokens(stakeAccount, amount) {
        return __awaiter(this, void 0, void 0, function* () {
            if (amount
                .toBN()
                .gt(stakeAccount
                .getBalanceSummary(yield this.getTime())
                .withdrawable.toBN())) {
                throw new Error("Amount exceeds withdrawable.");
            }
            const toAccount = yield spl_token_1.Token.getAssociatedTokenAddress(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, this.config.pythTokenMint, this.provider.wallet.publicKey);
            const preIxs = [];
            if ((yield this.provider.connection.getAccountInfo(toAccount)) == null) {
                preIxs.push(spl_token_1.Token.createAssociatedTokenAccountInstruction(spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID, spl_token_1.TOKEN_PROGRAM_ID, this.config.pythTokenMint, toAccount, this.provider.wallet.publicKey, this.provider.wallet.publicKey));
            }
            yield this.program.methods
                .withdrawStake(amount.toBN())
                .preInstructions(preIxs)
                .accounts({
                stakeAccountPositions: stakeAccount.address,
                destination: toAccount,
            })
                .rpc();
        });
    }
}
exports.StakeConnection = StakeConnection;
var VestingAccountState;
(function (VestingAccountState) {
    VestingAccountState[VestingAccountState["FullyVested"] = 0] = "FullyVested";
    VestingAccountState[VestingAccountState["UnvestedTokensFullyLocked"] = 1] = "UnvestedTokensFullyLocked";
    VestingAccountState[VestingAccountState["UnvestedTokensFullyLockedExceptCooldown"] = 2] = "UnvestedTokensFullyLockedExceptCooldown";
    VestingAccountState[VestingAccountState["UnvestedTokensPartiallyLocked"] = 3] = "UnvestedTokensPartiallyLocked";
    VestingAccountState[VestingAccountState["UnvestedTokensFullyUnlockedExceptCooldown"] = 4] = "UnvestedTokensFullyUnlockedExceptCooldown";
    VestingAccountState[VestingAccountState["UnvestedTokensFullyUnlocked"] = 5] = "UnvestedTokensFullyUnlocked";
})(VestingAccountState = exports.VestingAccountState || (exports.VestingAccountState = {}));
class StakeAccount {
    constructor(address, stakeAccountPositionsWasm, stakeAccountPositionsJs, stakeAccountMetadata, tokenBalance, authorityAddress, vestingSchedule, // Borsh serialized
    votingAccountMetadataWasm, totalSupply, config) {
        this.address = address;
        this.stakeAccountPositionsWasm = stakeAccountPositionsWasm;
        this.stakeAccountPositionsJs = stakeAccountPositionsJs;
        this.stakeAccountMetadata = stakeAccountMetadata;
        this.tokenBalance = tokenBalance;
        this.authorityAddress = authorityAddress;
        this.vestingSchedule = vestingSchedule;
        this.votingAccountMetadataWasm = votingAccountMetadataWasm;
        this.totalSupply = totalSupply;
        this.config = config;
    }
    // Withdrawable
    //Locked tokens :
    // - warmup
    // - active
    // - cooldown
    // Unvested
    getBalanceSummary(unixTime) {
        let unvestedBalance = wasm.getUnvestedBalance(this.vestingSchedule, BigInt(unixTime.toString()));
        let currentEpoch = unixTime.div(this.config.epochDuration);
        let unlockingDuration = this.config.unlockingDuration;
        let currentEpochBI = BigInt(currentEpoch.toString());
        const withdrawable = this.stakeAccountPositionsWasm.getWithdrawable(BigInt(this.tokenBalance.toString()), unvestedBalance, currentEpochBI, unlockingDuration);
        const withdrawableBN = new bn_js_1.default(withdrawable.toString());
        const unvestedBN = new bn_js_1.default(unvestedBalance.toString());
        const lockedSummaryBI = this.stakeAccountPositionsWasm.getLockedBalanceSummary(currentEpochBI, unlockingDuration);
        let lockingBN = new bn_js_1.default(lockedSummaryBI.locking.toString());
        let lockedBN = new bn_js_1.default(lockedSummaryBI.locked.toString());
        let preunlockingBN = new bn_js_1.default(lockedSummaryBI.preunlocking.toString());
        let unlockingBN = new bn_js_1.default(lockedSummaryBI.unlocking.toString());
        // For the user it makes sense that all the categories add up to the number of tokens in their custody account
        // This sections corrects the locked balances to achieve this invariant
        let excess = lockingBN
            .add(lockedBN)
            .add(preunlockingBN)
            .add(unlockingBN)
            .add(withdrawableBN)
            .add(unvestedBN)
            .sub(this.tokenBalance);
        let lockedUnvestedBN, lockingUnvestedBN, preUnlockingUnvestedBN, unlockingUnvestedBN;
        // First adjust locked. Most of the time, the unvested tokens are in this state.
        [excess, lockedBN, lockedUnvestedBN] = this.adjustLockedAmount(excess, lockedBN);
        // The unvested tokens can also be in a locking state at the very beginning.
        // The reason why we adjust this balance second is the following
        // If a user has 100 unvested in a locked position and decides to stake 1 free token
        // we want that token to appear as locking
        [excess, lockingBN, lockingUnvestedBN] = this.adjustLockedAmount(excess, lockingBN);
        // Needed to represent vesting accounts unlocking before the vesting event
        [excess, preunlockingBN, preUnlockingUnvestedBN] = this.adjustLockedAmount(excess, preunlockingBN);
        [excess, unlockingBN, unlockingUnvestedBN] = this.adjustLockedAmount(excess, unlockingBN);
        //Enforce the invariant
        (0, assert_1.default)(lockingBN
            .add(lockedBN)
            .add(preunlockingBN)
            .add(unlockingBN)
            .add(withdrawableBN)
            .add(unvestedBN)
            .eq(this.tokenBalance));
        return {
            // withdrawable tokens
            withdrawable: new pythBalance_1.PythBalance(withdrawableBN),
            // vested tokens not currently withdrawable
            locked: {
                locking: new pythBalance_1.PythBalance(lockingBN),
                locked: new pythBalance_1.PythBalance(lockedBN),
                unlocking: new pythBalance_1.PythBalance(unlockingBN),
                preunlocking: new pythBalance_1.PythBalance(preunlockingBN),
            },
            // unvested tokens
            unvested: {
                total: new pythBalance_1.PythBalance(unvestedBN),
                locked: new pythBalance_1.PythBalance(lockedUnvestedBN),
                locking: new pythBalance_1.PythBalance(lockingUnvestedBN),
                unlocking: new pythBalance_1.PythBalance(unlockingUnvestedBN),
                preunlocking: new pythBalance_1.PythBalance(preUnlockingUnvestedBN),
                unlocked: new pythBalance_1.PythBalance(unvestedBN
                    .sub(lockedUnvestedBN)
                    .sub(lockingUnvestedBN)
                    .sub(unlockingUnvestedBN)
                    .sub(preUnlockingUnvestedBN)),
            },
        };
    }
    adjustLockedAmount(excess, locked) {
        if (excess.gt(new bn_js_1.default(0))) {
            if (excess.gte(locked)) {
                return [excess.sub(locked), new bn_js_1.default(0), locked];
            }
            else {
                return [new bn_js_1.default(0), locked.sub(excess), excess];
            }
        }
        else {
            return [new bn_js_1.default(0), locked, new bn_js_1.default(0)];
        }
    }
    getVoterWeight(unixTime) {
        let currentEpoch = unixTime.div(this.config.epochDuration);
        let unlockingDuration = this.config.unlockingDuration;
        const voterWeightBI = this.stakeAccountPositionsWasm.getVoterWeight(BigInt(currentEpoch.toString()), unlockingDuration, BigInt(this.votingAccountMetadataWasm.getCurrentAmountLocked(BigInt(currentEpoch.toString()))));
        return new pythBalance_1.PythBalance(new bn_js_1.default(voterWeightBI.toString()));
    }
    getNextVesting(unixTime) {
        return wasm.getNextVesting(this.vestingSchedule, BigInt(unixTime.toString()));
    }
    static serializeVesting(lock, idl) {
        var _a;
        const VESTING_SCHED_MAX_BORSH_LEN = 4 * 8 + 1;
        let buffer = Buffer.alloc(VESTING_SCHED_MAX_BORSH_LEN);
        let idltype = (_a = idl === null || idl === void 0 ? void 0 : idl.types) === null || _a === void 0 ? void 0 : _a.find((v) => v.name === "VestingSchedule");
        const vestingSchedLayout = idljs.IdlCoder.typeDefLayout(idltype, idl.types);
        const length = vestingSchedLayout.encode(lock, buffer, 0);
        return buffer.slice(0, length);
    }
    getVestingAccountState(unixTime) {
        const vestingSummary = this.getBalanceSummary(unixTime).unvested;
        if (vestingSummary.total.isZero()) {
            return VestingAccountState.FullyVested;
        }
        if (vestingSummary.preunlocking.isZero() &&
            vestingSummary.unlocking.isZero()) {
            if (vestingSummary.locked.isZero() && vestingSummary.locking.isZero()) {
                return VestingAccountState.UnvestedTokensFullyUnlocked;
            }
            else if (vestingSummary.unlocked.isZero()) {
                return VestingAccountState.UnvestedTokensFullyLocked;
            }
            else {
                return VestingAccountState.UnvestedTokensPartiallyLocked;
            }
        }
        else {
            if (vestingSummary.locked.isZero() && vestingSummary.locking.isZero()) {
                return VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown;
            }
            else if (vestingSummary.unlocked.isZero()) {
                return VestingAccountState.UnvestedTokensFullyLockedExceptCooldown;
            }
            else {
                return VestingAccountState.UnvestedTokensPartiallyLocked;
            }
        }
    }
    addUnlockingPeriod(unixTime) {
        return unixTime.add(this.config.epochDuration.mul(new bn_js_1.default(this.config.unlockingDuration).add(new bn_js_1.default(1))));
    }
    getNetExcessGovernanceAtVesting(unixTime) {
        const nextVestingEvent = this.getNextVesting(unixTime);
        if (!nextVestingEvent) {
            return new bn_js_1.default(0);
        }
        const nextVestingEventTimeBn = new bn_js_1.default(nextVestingEvent.time.toString());
        const timeOfEval = bn_js_1.default.max(nextVestingEventTimeBn, this.addUnlockingPeriod(unixTime));
        const balanceSummary = this.getBalanceSummary(timeOfEval).locked;
        return balanceSummary.locking.toBN().add(balanceSummary.locked.toBN());
    }
}
exports.StakeAccount = StakeAccount;
