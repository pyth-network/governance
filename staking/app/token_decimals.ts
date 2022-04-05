import BN from 'bn.js';

/* Solana token balances are represented by an integer (BN on typescript), but the actual balance
is integer * 10 ** -decimals (a number on typescript) where decimals is a field of the token mint.
These two functions are used to convert from one representation to the other.
*/
export function amountBnToNumber(amount: BN, decimals: number): number {
    return amount.toNumber() * 10 ** -decimals;
  }
  
  export function amountNumberToBn(amount: number, decimals: number): BN {
    return new BN(amount * 10 ** decimals);
  }