import { Wallet } from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, RPC_NODE } from "./devnet";
import { STAKING_ADDRESS } from "../constants";
import { BN } from "bn.js";
import { PythBalance, StakeConnection } from "..";

const TWELVE_MONTHS = 3600 * 24 * 365;
const OWNER_PUBKEY = new PublicKey(0); // Populate with the beneficiary's public key
const AMOUNT: PythBalance = PythBalance.fromString("1"); // Populate with the right amount

async function main() {
  const client = new Connection(RPC_NODE);
  const stakeConnection = await StakeConnection.createStakeConnection(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    STAKING_ADDRESS
  );

  const vestingSchedule = {
    periodicVestingAfterListing: {
      initialBalance: AMOUNT.toBN(),
      periodDuration: new BN(TWELVE_MONTHS),
      numPeriods: new BN(4),
    },
  };

  await stakeConnection.setupVestingAccount(
    AMOUNT,
    OWNER_PUBKEY,
    vestingSchedule,
    false
  );
}

main();
