import BN from "bn.js";
import assert from "assert"

const PYTH_DECIMALS = 6;

export class PythBalance {
  integerAmount : BN;

  constructor(integerAmount: BN) {
    this.integerAmount = integerAmount;
  }

  toNumber() : number {
    return this.integerAmount.toNumber() * 10 ** -PYTH_DECIMALS;
  }

  static fromNumber(amount : number) : PythBalance {
    return new PythBalance(new BN(amount * 10 ** PYTH_DECIMALS))
  }

  static fromString(amount : string){
    if (amount.match(/^\d+$/)) {
      return new PythBalance(new BN(amount).mul(new BN(10 ** PYTH_DECIMALS)));
    }
    else if (amount.match(/^\d*\.\d{1,6}$/)){
      const integerPart = amount.split('.')[0];
      const decimalPart = amount.split('.')[1];
      const decimalLength = decimalPart.length;

      let resBN =  new BN(integerPart).mul(new BN(10 ** PYTH_DECIMALS));
      resBN = resBN.add( new BN(decimalPart).mul(new BN(10 ** (PYTH_DECIMALS - decimalLength))))

      console.log(resBN.toString());
      return new PythBalance(resBN);
    }
    else{
      throw new Error("Failed parsing");
    }
  }

  toString() : string {
    const padded = this.toBN().toString().padStart(PYTH_DECIMALS + 1,'0')
    return padded.slice(0, padded.length - 6) + '.' + padded.slice(padded.length - 6)
    
  }

  toBN(){
    return this.integerAmount
  }

  eq(other : PythBalance){
    this.toBN().eq(other.toBN())
  }
}
