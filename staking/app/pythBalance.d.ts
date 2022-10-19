import BN from "bn.js";
export declare const PYTH_DECIMALS = 6;
export declare class PythBalance {
  integerAmount: BN;
  constructor(integerAmount: BN);
  toNumber(): number;
  static zero(): PythBalance;
  static fromNumber(amount: number): PythBalance;
  static fromString(amount: string): PythBalance;
  toString(): string;
  toBN(): BN;
  eq(other: PythBalance): boolean;
  gte(other: PythBalance): boolean;
  lt(other: PythBalance): boolean;
  gt(other: PythBalance): boolean;
  lte(other: PythBalance): boolean;
  add(other: PythBalance): PythBalance;
  isZero(): boolean;
}
