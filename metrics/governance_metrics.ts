import { Counter, Gauge, register } from "prom-client";
import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_ENDPOINT,
  DEVNET_STAKING_ADDRESS,
  DEVNET_PYTH_MINT,
  LOCALNET_REALM_ID,
  PythBalance,
} from "pyth-staking-api";
import * as wasm from "pyth-staking-wasm";
import { StakeAccount, StakeConnection } from "pyth-staking-api";

async function main() {
  const globalFetchingError = new Counter({
    name: "staking_global_fetching_error",
    help: "Whether we failed fetching the list of accounts",
  });

  const accountValueTokens = new Gauge({
    name: "staking_account_value_tokens",
    help: "The value of an account in Pyth tokens",
    labelNames: ["address"],
  });

  const unexpectedStakingConfig = new Gauge({
    name: "staking_unpexpected_staking_config",
    help: "The number of times that the onchain config account hasn't matched what we expect",
  });

  const globalLockedInGovernance = new Gauge({
    name: "staking_global_locked_in_governance",
    help: "The on-chain aggregate number of locked tokens in governance",
  });

  // we probably don't need this as we can count all the labels for a gage
  const accountsCount = new Gauge({
    name: "staking_accounts_count",
    help: "The number of accounts that exist",
  });
  const numPositions = new Gauge({
    name: "staking_num_positions",
    help: "The number of positions of an account",
    labelNames: ["address"],
  });
  const accountIllegal = new Gauge({
    name: "staking_account_legal",
    help: "Whether an account is in an illegal state",
    labelNames: ["address"],
  });

  const nextIndexIllegal = new Gauge({
    name: "staking_next_index_illegal",
    help: "Whether an account violates the next index invariant",
    labelNames: ["address"],
  });

  const voterRecordIllegal = new Gauge({
    name: "staking_voter_record_illegal",
    help: "Whether an account voter record is illegal",
    labelNames: ["address"],
  });

  const balanceByType = new Gauge({
    name: "staking_balance_by_type",
    help: "The unvested token balance of an account",
    labelNames: ["address", "type", "subtype"],
  });
  const accountErrorFetching = new Counter({
    name: "staking_account_error_fetching",
    help: "Whether the code failed fetching an account",
    labelNames: ["address"],
  });

  const accountErrorParsing = new Counter({
    name: "staking_account_error_parsing",
    help: "Whether the code failed parsing an account",
    labelNames: ["address"],
  });

  const RPC_ENDPOINT = DEVNET_ENDPOINT;
  const PROG_ID = DEVNET_STAKING_ADDRESS;

  try {
    const connection = new Connection(RPC_ENDPOINT);
    const emptyWallet = new Wallet(Keypair.generate());
    const stakeConnection = await StakeConnection.createStakeConnection(
      connection,
      emptyWallet,
      PROG_ID
    );
    const time = await stakeConnection.getTime();

    checkConfig(stakeConnection, unexpectedStakingConfig);
    await readVotingProductMetadataAccount(
      stakeConnection,
      time,
      globalLockedInGovernance
    );

    // fetch accounts
    const allPositionAccountAddresses =
      await stakeConnection.getAllStakeAccountAddresses();
    const slot = await stakeConnection.provider.connection.getSlot();
    accountsCount.set({}, allPositionAccountAddresses.length);
    for (const address of allPositionAccountAddresses) {
      console.log(address.toBase58());
      const label = { address: address.toBase58() };
      try {
        //fetch account
        const stakeAccount = await stakeConnection.loadStakeAccount(address);
        numPositions.set(
          label,
          stakeAccount.stakeAccountPositionsJs.positions.filter(
            (p) => p != null
          ).length
        );
        accountValueTokens.set(
          label,
          new PythBalance(stakeAccount.tokenBalance).toNumber()
        );
        await hasLegalVoterWeightRecord(
          stakeConnection,
          stakeAccount,
          slot,
          voterRecordIllegal
        );
        nextIndexInvariant(stakeAccount, nextIndexIllegal);

        const isLegal = hasLegalState(stakeAccount, time);

        if (isLegal) {
          const balanceSummary = stakeAccount.getBalanceSummary(
            await stakeConnection.getTime()
          );
          for (let type in balanceSummary) {
            if (balanceSummary[type] instanceof PythBalance) {
              balanceByType.set(
                { address: address.toBase58(), type: type, subtype: type },
                (balanceSummary[type] as PythBalance).toNumber()
              );
            } else {
              for (let subtype in balanceSummary[type]) {
                balanceByType.set(
                  { address: address.toBase58(), type: type, subtype: subtype },
                  balanceSummary[type][subtype].toNumber()
                );
              }
            }
          }
        } else {
          accountIllegal.set({ address: address.toBase58() }, 1);
        }
      } catch (e) {
        // TODO: Distinguish between error types
        if (true) {
          //rpc error
          accountErrorFetching.inc(label, 1);
        } else {
          //parsing error
          accountErrorParsing.inc(label, 1);
        }
      }
    }
  } catch {
    globalFetchingError.inc(1);
  }
  console.log(await register.metrics());
}

function checkConfig(stakeConnection: StakeConnection, counter) {
  const actualConfig = {
    pythGovernanceRealm: stakeConnection.config.pythGovernanceRealm,
    pythTokenMint: stakeConnection.config.pythTokenMint,
    unlockingDuration: stakeConnection.config.unlockingDuration,
    epochDuration: stakeConnection.config.epochDuration,
    freeze: stakeConnection.config.freeze,
  };

  const expectedConfig = {
    // bump
    // governanceAuthority
    pythGovernanceRealm: LOCALNET_REALM_ID,
    pythTokenMint: DEVNET_PYTH_MINT,
    unlockingDuration: 1,
    epochDuration: new BN(3600),
    freeze: false,
  };

  if (JSON.stringify(actualConfig) != JSON.stringify(expectedConfig)) {
    counter.inc();
  }
}

async function readVotingProductMetadataAccount(
  stakeConnection: StakeConnection,
  time: BN,
  gauge
) {
  const votingAccountMetadataWasm =
    await stakeConnection.fetchVotingProductMetadataAccount();
  const currentEpoch = time.div(stakeConnection.config.epochDuration);

  const result = votingAccountMetadataWasm.getCurrentAmountLocked(
    BigInt(currentEpoch.toString())
  );

  gauge.set(new PythBalance(new BN(result.toString())).toNumber());
}

function nextIndexInvariant(stakeAccount: StakeAccount, gauge) {
  const nextIndex = stakeAccount.stakeAccountMetadata.nextIndex;
  for (let i = 0; i < nextIndex; i++) {
    if (!stakeAccount.stakeAccountPositionsJs.positions[i]) {
      gauge.set({ address: stakeAccount.address.toBase58() }, 1);
      return;
    }
  }
  for (let i = nextIndex; i < wasm.Constants.MAX_POSITIONS(); i++) {
    if (stakeAccount.stakeAccountPositionsJs.positions[i]) {
      gauge.set({ address: stakeAccount.address.toBase58() }, 1);
      return;
    }
  }
}
function hasLegalState(stakeAccount: StakeAccount, time: BN) {
  try {
    let unvestedBalance = wasm.getUnvestedBalance(
      stakeAccount.vestingSchedule,
      BigInt(time.toString())
    );

    let currentEpoch = time.div(stakeAccount.config.epochDuration);
    let unlockingDuration = stakeAccount.config.unlockingDuration;
    let currentEpochBI = BigInt(currentEpoch.toString());

    stakeAccount.stakeAccountPositionsWasm.getWithdrawable(
      BigInt(stakeAccount.tokenBalance.toString()),
      unvestedBalance,
      currentEpochBI,
      unlockingDuration
    );
    return true;
  } catch (e) {
    return false;
  }
}

async function hasLegalVoterWeightRecord(
  stakeConnection: StakeConnection,
  stakeAccount: StakeAccount,
  slot,
  gauge
) {
  const { voterWeightAccount } = await stakeConnection.withUpdateVoterWeight(
    [],
    stakeAccount,
    { castVote: {} },
    new PublicKey(0)
  );

  const onChain = await stakeConnection.program.account.voterWeightRecord.fetch(
    voterWeightAccount
  );

  if (
    !(
      !onChain.voterWeight.toNumber() ||
      (onChain.voterWeightExpiry &&
        onChain.weightAction &&
        onChain.voterWeightExpiry.toNumber() <= slot)
    )
  ) {
    gauge.set({ address: stakeAccount.address.toBase58() }, 1);
  }
}

main();
