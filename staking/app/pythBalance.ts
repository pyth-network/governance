import BN from "bn.js";
import assert from "assert";

export const PYTH_DECIMALS = 6;
const INTEGER_REGEXP = new RegExp(/^\d+$/);
const DECIMAL_REGEXP = new RegExp(`^\\d*\\.\\d{0,${PYTH_DECIMALS}}$`);
const TRAILING_ZEROS = new RegExp(/\.?0+$/);

export class PythBalance {
  integerAmount: BN;

  constructor(integerAmount: BN) {
    this.integerAmount = integerAmount;
  }

  //THIS METHOD MAY LOSE PRECISION
  toNumber(): number {
    return this.integerAmount.toNumber() * 10 ** -PYTH_DECIMALS;
  }

  static Zero(): PythBalance {
    return PythBalance.fromString("0");
  }
  //THIS METHOD MAY LOSE PRECISION IF AMOUNT IS NOT AN INTEGER
  static fromNumber(amount: number): PythBalance {
    return new PythBalance(new BN(amount * 10 ** PYTH_DECIMALS));
  }

  static fromString(amount: string) {
    if (amount.match(INTEGER_REGEXP)) {
      return new PythBalance(new BN(amount).mul(new BN(10 ** PYTH_DECIMALS)));
    } else if (amount.match(DECIMAL_REGEXP)) {
      const integerPart = amount.split(".")[0];
      const decimalPart = amount.split(".")[1];
      const decimalLength = decimalPart.length;

      let resBN = new BN(integerPart).mul(new BN(10 ** PYTH_DECIMALS));
      resBN = resBN.add(
        new BN(decimalPart).mul(new BN(10 ** (PYTH_DECIMALS - decimalLength)))
      );

      return new PythBalance(resBN);
    } else {
      throw new Error("Failed parsing");
    }
  }

  toString(): string {
    const padded = this.toBN()
      .toString()
      .padStart(PYTH_DECIMALS + 1, "0");
    return (
      padded.slice(0, padded.length - PYTH_DECIMALS) +
      ("." + padded.slice(padded.length - PYTH_DECIMALS)).replace(
        TRAILING_ZEROS,
        ""
      )
    );
  }

  toBN() {
    return this.integerAmount;
  }

  eq(other: PythBalance): boolean {
    return this.toBN().eq(other.toBN());
  }

  gte(other: PythBalance): boolean {
    return this.toBN().gte(other.toBN());
  }

  lt(other: PythBalance): boolean {
    return this.toBN().lt(other.toBN());
  }

  gt(other: PythBalance): boolean {
    return this.toBN().gt(other.toBN());
  }

  lte(other: PythBalance): boolean {
    return this.toBN().lte(other.toBN());
  }

  add(other: PythBalance): PythBalance {
    return new PythBalance(other.toBN().add(this.toBN()));
  }

  isZero(): boolean {
    return this.eq(PythBalance.Zero());
  }
}
