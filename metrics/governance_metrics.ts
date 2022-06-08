import { Counter, Gauge, register } from "prom-client";
import { Program, Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_ENDPOINT,
  DEVNET_STAKING_ADDRESS,
  PythBalance,
} from "pyth-staking-api";
import { StakeAccount, StakeConnection } from "pyth-staking-api";

async function main() {
  const globalFetchErrCtr = new Counter({
    name: "staking_global_fetching_error",
    help: "Whether we failed fetching the list of accounts",
  });

  const tokensGauge = new Gauge({
    name: "staking_account_value_tokens",
    help: "The value of an account in Pyth tokens",
    labelNames: ["address"],
  });
  const stakeAccountsGauge = new Gauge({
    name: "staking_accounts_count",
    help: "The number of accounts that exist",
  });
  const numPositionsGauge = new Gauge({
    name: "staking_num_positions",
    help: "The number of positions of an account in Pyth tokens",
    labelNames: ["address"],
  });
  const balanceTypeGauge = new Gauge({
    name: "staking_balance_by_type",
    help: "The unvested token balance of an account",
    labelNames: ["address", "type", "subtype"],
  });
  const accountFetchErrCtr = new Counter({
    name: "staking_account_error_fetching",
    help: "Whether the code failed fetching an account",
    labelNames: ["address"],
  });

  const accountParseErrCtr = new Counter({
    name: "staking_account_error_parsing",
    help: "Whether the code failed parsing an account",
    labelNames: ["address"],
  });

  const RPC_ENDPOINT = DEVNET_ENDPOINT;
  const PROG_ID = DEVNET_STAKING_ADDRESS;

  const connection = new Connection(RPC_ENDPOINT);
  const emptyWallet = new Wallet(Keypair.generate());
  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    emptyWallet,
    PROG_ID
  );

  while (true) {
    try {
      // fetch accounts
      const allPositionAccountAddresses =
        await stakeConnection.getAllStakeAccountAddresses();
      stakeAccountsGauge.set({}, allPositionAccountAddresses.length);
      for (const address of allPositionAccountAddresses) {
        console.log(address.toBase58());
        const label = { address: address.toBase58() };
        try {
          //fetch account
          const stakeAccount = await stakeConnection.loadStakeAccount(address);
          numPositionsGauge.set(
            label,
            stakeAccount.stakeAccountPositionsJs.positions.filter(
              (p) => p != null
            ).length
          );
          tokensGauge.set(label, stakeAccount.tokenBalance.toNumber());
          const balanceSummary = stakeAccount.getBalanceSummary(
            await stakeConnection.getTime()
          );
          for (let type in balanceSummary) {
            if (balanceSummary[type] instanceof PythBalance) {
              balanceTypeGauge.set(
                { address: address.toBase58(), type: type, subtype: type },
                (balanceSummary[type] as PythBalance).toNumber()
              );
            } else {
              for (let subtype in balanceSummary[type]) {
                balanceTypeGauge.set(
                  { address: address.toBase58(), type: type, subtype: subtype },
                  balanceSummary[type][subtype].toNumber()
                );
              }
            }
          }
        } catch (e) {
          // TODO: Distinguish between error types
          if (true) {
            //rpc error
            accountFetchErrCtr.inc(label, 1);
          } else {
            //parsing error
            accountParseErrCtr.inc(label, 1);
          }
        }
      }
    } catch {
      globalFetchErrCtr.inc(1);
    }
    console.log(await register.metrics());
  }
}

main();
