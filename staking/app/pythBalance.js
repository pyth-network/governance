"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythBalance = exports.PYTH_DECIMALS = void 0;
const bn_js_1 = __importDefault(require("bn.js"));
exports.PYTH_DECIMALS = 6;
const INTEGER_REGEXP = new RegExp(/^\d+$/);
const DECIMAL_REGEXP = new RegExp(`^\\d*\\.\\d{0,${exports.PYTH_DECIMALS}}$`);
const TRAILING_ZEROS = new RegExp(/\.?0+$/);
class PythBalance {
    constructor(integerAmount) {
        this.integerAmount = integerAmount;
    }
    //THIS METHOD MAY LOSE PRECISION
    toNumber() {
        return this.integerAmount.toNumber() * Math.pow(10, -exports.PYTH_DECIMALS);
    }
    static zero() {
        return PythBalance.fromString("0");
    }
    //THIS METHOD MAY LOSE PRECISION IF AMOUNT IS NOT AN INTEGER
    static fromNumber(amount) {
        return new PythBalance(new bn_js_1.default(amount * Math.pow(10, exports.PYTH_DECIMALS)));
    }
    static fromString(amount) {
        if (amount.match(INTEGER_REGEXP)) {
            return new PythBalance(new bn_js_1.default(amount).mul(new bn_js_1.default(Math.pow(10, exports.PYTH_DECIMALS))));
        }
        else if (amount.match(DECIMAL_REGEXP)) {
            const integerPart = amount.split(".")[0];
            const decimalPart = amount.split(".")[1];
            const decimalLength = decimalPart.length;
            let resBN = new bn_js_1.default(integerPart).mul(new bn_js_1.default(Math.pow(10, exports.PYTH_DECIMALS)));
            resBN = resBN.add(new bn_js_1.default(decimalPart).mul(new bn_js_1.default(Math.pow(10, (exports.PYTH_DECIMALS - decimalLength)))));
            return new PythBalance(resBN);
        }
        else {
            throw new Error("Failed parsing");
        }
    }
    toString() {
        const padded = this.toBN()
            .toString()
            .padStart(exports.PYTH_DECIMALS + 1, "0");
        return (padded.slice(0, padded.length - exports.PYTH_DECIMALS) +
            ("." + padded.slice(padded.length - exports.PYTH_DECIMALS)).replace(TRAILING_ZEROS, ""));
    }
    toBN() {
        return this.integerAmount;
    }
    eq(other) {
        return this.toBN().eq(other.toBN());
    }
    gte(other) {
        return this.toBN().gte(other.toBN());
    }
    lt(other) {
        return this.toBN().lt(other.toBN());
    }
    gt(other) {
        return this.toBN().gt(other.toBN());
    }
    lte(other) {
        return this.toBN().lte(other.toBN());
    }
    add(other) {
        return new PythBalance(other.toBN().add(this.toBN()));
    }
    isZero() {
        return this.eq(PythBalance.zero());
    }
}
exports.PythBalance = PythBalance;
