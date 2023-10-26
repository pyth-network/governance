import { Wallet } from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, RPC_NODE } from "./devnet";
import { STAKING_ADDRESS } from "../constants";
import { BN } from "bn.js";
import { PythBalance, StakeConnection } from "..";

const SIX_MONTHS = 1800 * 24 * 365;
const OWNER_PUBKEY = new PublicKey(0);

async function main() {
  const client = new Connection(RPC_NODE);
  const stakeConnection = await StakeConnection.createStakeConnection(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    STAKING_ADDRESS
  );

  const vestingSchedule = {
    periodicVestingAfterListing: {
      initialBalance: PythBalance.fromString("1").toBN(),
      periodDuration: new BN(SIX_MONTHS),
      numPeriods: new BN(4),
    },
  };

  await stakeConnection.setupVestingAccount(
    PythBalance.fromString("1"),
    OWNER_PUBKEY,
    vestingSchedule
  );
}

main();
