import { Wallet, AnchorProvider } from "@project-serum/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, STAKING_PROGRAM, RPC_NODE } from "./devnet";
import { BN } from "bn.js";
import { PythBalance, StakeConnection } from "..";

async function main() {
  const client = new Connection(RPC_NODE);
  const provider = new AnchorProvider(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    {}
  );
  const recipient = new PublicKey(
    "BZutixDWD7TNwfvmWt3Zmqzh18wCic8HjcUW26QmiXSd"
  );

  const stakeConnection = await StakeConnection.createStakeConnection(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    STAKING_PROGRAM
  );

  const vestingSchedule = {
    periodicVesting: {
      initialBalance: PythBalance.fromString("100").toBN(),
      startDate: await stakeConnection.getTime(),
      periodDuration: new BN(3600),
      numPeriods: new BN(1000),
    },
  };

  await stakeConnection.setupVestingAccount(
    PythBalance.fromString("100"),
    recipient,
    vestingSchedule
  );
}

main();
