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
exports.PythClient = void 0;
const constants_1 = require("./constants");
const StakeConnection_1 = require("./StakeConnection");
class PythClient {
    constructor(stakeConnection, cluster) {
        this.stakeConnection = stakeConnection;
        this.cluster = cluster;
        this.program = {
            programId: cluster === "localnet"
                ? constants_1.LOCALNET_STAKING_ADDRESS
                : constants_1.DEVNET_STAKING_ADDRESS,
        };
    }
    static connect(provider, cluster) {
        return __awaiter(this, void 0, void 0, function* () {
            // only supports localnet and devnet for now
            // TODO: update this to support mainnet when program is deployed
            return new PythClient(yield StakeConnection_1.StakeConnection.createStakeConnection(provider.connection, provider.wallet, cluster === "localnet"
                ? constants_1.LOCALNET_STAKING_ADDRESS
                : constants_1.DEVNET_STAKING_ADDRESS), cluster);
        });
    }
}
exports.PythClient = PythClient;
