import { Wallet } from "@project-serum/anchor";
import {
  DEVNET_ENDPOINT,
  DEVNET_PYTH_MINT,
  DEVNET_STAKING_ADDRESS,
  GOVERNANCE_ADDRESS,
  PythBalance,
  REALM_ID,
  StakeAccount,
  StakeConnection,
} from "@pythnetwork/staking";
import { tryGetRealmConfig } from "@solana/spl-governance";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { Counter, Gauge } from "prom-client";
import * as wasm from "pyth-staking-wasm";

export class Metrics {
  globalError = new Counter({
    name: "staking_global_error",
    help: "Error at the global level",
    labelNames: ["type"],
  });

  globalLockedInGovernance = new Gauge({
    name: "staking_global_locked_in_governance",
    help: "The on-chain aggregate number of locked tokens in governance this epoch",
    labelNames: ["epoch"],
  });

  accountError = new Gauge({
    name: "staking_account_error",
    help: "Error for an individual account",
    labelNames: ["type", "address"],
  });

  accountNumTokens = new Gauge({
    name: "staking_account_num_tokens",
    help: "The value of an account in Pyth tokens",
    labelNames: ["address"],
  });

  accountNumPositions = new Gauge({
    name: "staking_account_num_positions",
    help: "The number of positions of an account",
    labelNames: ["address"],
  });

  accountBalanceByType = new Gauge({
    name: "staking_account_balance_by_type",
    help: "The unvested token balance of an account",
    labelNames: ["address", "type", "subtype"],
  });

  private catchGlobalFetchError() {
    this.globalError.inc({ type: "fetch" });
  }

  private catchGlobalDefaultError() {
    this.globalError.inc({ type: "default" });
  }
  private updateAccountNumTokens(stakeAccount: StakeAccount) {
    this.accountNumTokens.set(
      { address: stakeAccount.address.toBase58() },
      new PythBalance(stakeAccount.tokenBalance).toNumber()
    );
  }
  private async checkGlobalErrorConfig(stakeConnection: StakeConnection) {
    const actualRealmConfig = (
      await tryGetRealmConfig(
        stakeConnection.provider.connection,
        GOVERNANCE_ADDRESS(),
        REALM_ID
      )
    ).account;

    const expectedRealmConfig = {
      accountType: 11,
      realm: REALM_ID,
      communityVoterWeightAddin: DEVNET_STAKING_ADDRESS,
      maxCommunityVoterWeightAddin: DEVNET_STAKING_ADDRESS,
    };

    if (
      JSON.stringify(actualRealmConfig) != JSON.stringify(expectedRealmConfig)
    ) {
      this.globalError.inc({ type: "governance_config" }, 1);
    }

    const actualConfig = {
      pythGovernanceRealm: stakeConnection.config.pythGovernanceRealm,
      pythTokenMint: stakeConnection.config.pythTokenMint,
      unlockingDuration: stakeConnection.config.unlockingDuration,
      epochDuration: stakeConnection.config.epochDuration,
      freeze: stakeConnection.config.freeze,
      mockClockTime: stakeConnection.config.mockClockTime,
    };

    const expectedConfig = {
      // bump
      // governanceAuthority
      pythGovernanceRealm: REALM_ID,
      pythTokenMint: DEVNET_PYTH_MINT,
      unlockingDuration: 1,
      epochDuration: new BN(3600),
      freeze: false,
      mockClockTime: new BN(0),
    };

    if (JSON.stringify(actualConfig) != JSON.stringify(expectedConfig)) {
      this.globalError.inc({ type: "staking_config" }, 1);
    }
  }

  private async updateGlobalLockedInGovernance(
    stakeConnection: StakeConnection,
    time: BN
  ) {
    const votingAccountMetadataWasm =
      await stakeConnection.fetchVotingProductMetadataAccount();
    const currentEpoch = time.div(stakeConnection.config.epochDuration);

    const lockedNow = votingAccountMetadataWasm.getCurrentAmountLocked(
      BigInt(currentEpoch.toString())
    );

    const lockedNext = votingAccountMetadataWasm.getCurrentAmountLocked(
      BigInt(currentEpoch.add(stakeConnection.config.epochDuration).toString())
    );

    this.globalLockedInGovernance.set(
      { epoch: "now" },
      new PythBalance(new BN(lockedNow.toString())).toNumber()
    );
    this.globalLockedInGovernance.set(
      { epoch: "next" },
      new PythBalance(new BN(lockedNext.toString())).toNumber()
    );
  }

  private updateAccountNumPositions(stakeAccount: StakeAccount) {
    this.accountNumPositions.set(
      { address: stakeAccount.address.toBase58() },
      stakeAccount.stakeAccountPositionsJs.positions.filter((p) => p != null)
        .length
    );
  }

  private checkAccountErrorRisk(stakeAccount: StakeAccount, time: BN) {
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
      this.accountError.set(
        { type: "risk", address: stakeAccount.address.toBase58() },
        1
      );
      return false;
    }
  }

  private checkAccountErrorNextIndex(stakeAccount: StakeAccount) {
    const nextIndex = stakeAccount.stakeAccountMetadata.nextIndex;
    for (let i = 0; i < nextIndex; i++) {
      if (!stakeAccount.stakeAccountPositionsJs.positions[i]) {
        this.accountError.set(
          { type: "next_index", address: stakeAccount.address.toBase58() },
          1
        );
        return;
      }
    }
    for (let i = nextIndex; i < wasm.Constants.MAX_POSITIONS(); i++) {
      if (stakeAccount.stakeAccountPositionsJs.positions[i]) {
        this.accountError.set(
          { type: "next_index", address: stakeAccount.address.toBase58() },
          1
        );
        return;
      }
    }
  }

  private async checkAccountErrorVoterRecord(
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
      this.accountError.set(
        { type: "voter_record", address: stakeAccount.address.toBase58() },
        1
      );
    }
  }

  private async updateAccountBalanceByType(
    stakeAccount: StakeAccount,
    time: BN
  ) {
    const balanceSummary = stakeAccount.getBalanceSummary(time);
    for (let type in balanceSummary) {
      if (balanceSummary[type] instanceof PythBalance) {
        this.accountBalanceByType.set(
          {
            address: stakeAccount.address.toBase58(),
            type: type,
            subtype: type,
          },
          (balanceSummary[type] as PythBalance).toNumber()
        );
      } else {
        for (let subtype in balanceSummary[type]) {
          this.accountBalanceByType.set(
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

  private catchAccountDefaultError(address: PublicKey) {
    this.accountError.inc({ address: address.toBase58(), type: "default" }, 1);
  }

  public async updateAllMetrics() {
    const RPC_ENDPOINT = process.env.RPC_ENDPOINT || DEVNET_ENDPOINT;
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

      await this.checkGlobalErrorConfig(stakeConnection);
      await this.updateGlobalLockedInGovernance(stakeConnection, time);

      // fetch accounts
      const allPositionAccountAddresses =
        await stakeConnection.getAllStakeAccountAddresses();

      for (const address of allPositionAccountAddresses) {
        console.log(address.toBase58());
        try {
          //fetch account
          const stakeAccount = await stakeConnection.loadStakeAccount(address);
          this.updateAccountNumPositions(stakeAccount);
          this.updateAccountNumTokens(stakeAccount);
          await this.checkAccountErrorVoterRecord(
            stakeConnection,
            stakeAccount,
            slot
          );
          this.checkAccountErrorNextIndex(stakeAccount);
          const isLegal = this.checkAccountErrorRisk(stakeAccount, time);

          if (isLegal) {
            this.updateAccountBalanceByType(stakeAccount, time);
          }
        } catch (e) {
          console.log(e);
          this.catchAccountDefaultError(address);
        }
      }
    } catch (e) {
      if (e.message.includes("FetchError")) {
        this.catchGlobalFetchError();
      } else {
        // log the error
        console.log(e);
        this.catchGlobalDefaultError();
      }
    }
  }
}
