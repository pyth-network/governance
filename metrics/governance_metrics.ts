import { Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Counter, Gauge } from "prom-client";
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

export class Metrics {
  globalFetchingError = new Counter({
    name: "staking_global_fetching_error",
    help: "Whether we failed fetching the list of accounts",
  });

  accountValueTokens = new Gauge({
    name: "staking_account_value_tokens",
    help: "The value of an account in Pyth tokens",
    labelNames: ["address"],
  });

  unexpectedStakingConfig = new Gauge({
    name: "staking_unpexpected_staking_config",
    help: "The number of times that the onchain config account hasn't matched what we expect",
  });

  globalLockedInGovernance = new Gauge({
    name: "staking_global_locked_in_governance",
    help: "The on-chain aggregate number of locked tokens in governance",
  });

  numPositions = new Gauge({
    name: "staking_num_positions",
    help: "The number of positions of an account",
    labelNames: ["address"],
  });
  accountIllegal = new Gauge({
    name: "staking_account_legal",
    help: "Whether an account is in an illegal state",
    labelNames: ["address"],
  });

  nextIndexIllegal = new Gauge({
    name: "staking_next_index_illegal",
    help: "Whether an account violates the next index invariant",
    labelNames: ["address"],
  });

  voterRecordIllegal = new Gauge({
    name: "staking_voter_record_illegal",
    help: "Whether an account voter record is illegal",
    labelNames: ["address"],
  });

  balanceByType = new Gauge({
    name: "staking_balance_by_type",
    help: "The unvested token balance of an account",
    labelNames: ["address", "type", "subtype"],
  });
  accountErrorFetching = new Counter({
    name: "staking_account_error_fetching",
    help: "Whether the code failed fetching an account",
    labelNames: ["address"],
  });

  accountErrorParsing = new Counter({
    name: "staking_account_error_parsing",
    help: "Whether the code failed parsing an account",
    labelNames: ["address"],
  });

  private catchGlobalFetchingError() {
    this.globalFetchingError.inc();
  }
  private updateAccountValueTokens(stakeAccount: StakeAccount) {
    this.accountValueTokens.set(
      { address: stakeAccount.address.toBase58() },
      new PythBalance(stakeAccount.tokenBalance).toNumber()
    );
  }
  private updateUnexpectedStakingConfig(stakeConnection: StakeConnection) {
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
      this.unexpectedStakingConfig.inc();
    }
  }

  private async updateGlobalLockedInGovernance(
    stakeConnection: StakeConnection,
    time: BN
  ) {
    const votingAccountMetadataWasm =
      await stakeConnection.fetchVotingProductMetadataAccount();
    const currentEpoch = time.div(stakeConnection.config.epochDuration);

    const result = votingAccountMetadataWasm.getCurrentAmountLocked(
      BigInt(currentEpoch.toString())
    );

    this.globalLockedInGovernance.set(
      new PythBalance(new BN(result.toString())).toNumber()
    );
  }

  private updateNumPositions(stakeAccount: StakeAccount) {
    this.numPositions.set(
      { address: stakeAccount.address.toBase58() },
      stakeAccount.stakeAccountPositionsJs.positions.filter((p) => p != null)
        .length
    );
  }

  private updateAccountIllegal(stakeAccount: StakeAccount, time: BN) {
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
      this.accountIllegal.set({ address: stakeAccount.address.toBase58() }, 1);
      return false;
    }
  }

  private updateNextIndexIllegal(stakeAccount: StakeAccount) {
    const nextIndex = stakeAccount.stakeAccountMetadata.nextIndex;
    for (let i = 0; i < nextIndex; i++) {
      if (!stakeAccount.stakeAccountPositionsJs.positions[i]) {
        this.nextIndexIllegal.set(
          { address: stakeAccount.address.toBase58() },
          1
        );
        return;
      }
    }
    for (let i = nextIndex; i < wasm.Constants.MAX_POSITIONS(); i++) {
      if (stakeAccount.stakeAccountPositionsJs.positions[i]) {
        this.nextIndexIllegal.set(
          { address: stakeAccount.address.toBase58() },
          1
        );
        return;
      }
    }
  }

  private async updateVoterRecordIllegal(
    stakeConnection: StakeConnection,
    stakeAccount: StakeAccount,
    slot
  ) {
    const { voterWeightAccount } = await stakeConnection.withUpdateVoterWeight(
      [],
      stakeAccount,
      { castVote: {} },
      new PublicKey(0)
    );

    const onChain =
      await stakeConnection.program.account.voterWeightRecord.fetch(
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
      this.voterRecordIllegal.set(
        { address: stakeAccount.address.toBase58() },
        1
      );
    }
  }

  private async updateBalanceByType(stakeAccount: StakeAccount, time: BN) {
    const balanceSummary = stakeAccount.getBalanceSummary(time);
    for (let type in balanceSummary) {
      if (balanceSummary[type] instanceof PythBalance) {
        this.balanceByType.set(
          {
            address: stakeAccount.address.toBase58(),
            type: type,
            subtype: type,
          },
          (balanceSummary[type] as PythBalance).toNumber()
        );
      } else {
        for (let subtype in balanceSummary[type]) {
          this.balanceByType.set(
            {
              address: stakeAccount.address.toBase58(),
              type: type,
              subtype: subtype,
            },
            balanceSummary[type][subtype].toNumber()
          );
        }
      }
    }
  }

  private catchAccountErrorFetching(address: PublicKey) {
    this.accountErrorFetching.inc({ address: address.toBase58() }, 1);
  }

  private catchAccountErrorParsing(address: PublicKey) {
    this.accountErrorParsing.inc({ address: address.toBase58() }, 1);
  }

  public async updateAllMetrics() {
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
      const slot = await stakeConnection.provider.connection.getSlot();

      this.updateUnexpectedStakingConfig(stakeConnection);
      await this.updateGlobalLockedInGovernance(stakeConnection, time);

      // fetch accounts
      const allPositionAccountAddresses =
        await stakeConnection.getAllStakeAccountAddresses();

      for (const address of allPositionAccountAddresses) {
        console.log(address.toBase58());
        try {
          //fetch account
          const stakeAccount = await stakeConnection.loadStakeAccount(address);
          this.updateNumPositions(stakeAccount);
          this.updateAccountValueTokens(stakeAccount);
          await this.updateVoterRecordIllegal(
            stakeConnection,
            stakeAccount,
            slot
          );
          this.updateNextIndexIllegal(stakeAccount);
          const isLegal = this.updateAccountIllegal(stakeAccount, time);

          if (isLegal) {
            this.updateBalanceByType(stakeAccount, time);
          }
        } catch (e) {
          // TODO: Distinguish between error types
          if (true) {
            //rpc error
            this.catchAccountErrorFetching(address);
          } else {
            //parsing error
            this.catchAccountErrorParsing(address);
          }
        }
      }
    } catch {
      this.catchGlobalFetchingError();
    }
  }
}
