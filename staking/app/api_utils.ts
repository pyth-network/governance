// This file contains utility functions for the API. Unfortunately we can't use StakeConnection directly because it has wasm imports that are not compatible with the Next API.

import { Connection, PublicKey } from "@solana/web3.js";
import { STAKING_ADDRESS, PYTH_TOKEN } from "./constants";
import BN from "bn.js";
import { PythBalance } from "./pythBalance";
import { IdlAccounts, Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { LOCKED_ACCOUNTS_PERIODIC_AFTER_LISTING } from "./lockedAccounts";

const ONE_YEAR = new BN(3600 * 24 * 365);

// ======================================
// PDA derivations
// ======================================

function getMetadataAccountAddress(positionAccountAddress: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake_metadata"), positionAccountAddress.toBuffer()],
    STAKING_ADDRESS
  )[0];
}

function getCustodyAccountAddress(positionAccountAddress: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("custody"), positionAccountAddress.toBuffer()],
    STAKING_ADDRESS
  )[0];
}

// ======================================
// One-user getters
// ======================================

export async function getStakeAccountsByOwner(
  connection: Connection,
  owner: PublicKey
) {
  const response = await connection.getProgramAccounts(STAKING_ADDRESS, {
    encoding: "base64",
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from("55c3f14f7cc04f0b", "hex")), // Positions account discriminator
        },
      },
      {
        memcmp: {
          offset: 8,
          bytes: owner.toBase58(),
        },
      },
    ],
  });
  return response.map((account) => {
    return account.pubkey;
  });
}

export async function getStakeAccountDetails(
  stakingProgram: Program<Staking>,
  tokenProgram: any,
  positionAccountAddress: PublicKey
) {
  const configAccountData = await getConfig(stakingProgram);

  const metadataAccountAddress = getMetadataAccountAddress(
    positionAccountAddress
  );
  const metadataAccountData =
    await stakingProgram.account.stakeAccountMetadataV2.fetch(
      metadataAccountAddress
    );

  const lock = metadataAccountData.lock;

  const custodyAccountAddress = getCustodyAccountAddress(
    positionAccountAddress
  );
  const custodyAccountData = await tokenProgram.account.account.fetch(
    custodyAccountAddress
  );

  return {
    custodyAccount: custodyAccountAddress.toBase58(),
    actualAmount: new PythBalance(custodyAccountData.amount).toString(),
    lock: getLockSummary(lock, configAccountData.pythTokenListTime),
  };
}

// ======================================
// Global getters
// ======================================

async function getConfig(
  stakingProgram: Program<Staking>
): Promise<IdlAccounts<Staking>["globalConfig"]> {
  const configAccountAddress = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    STAKING_ADDRESS
  )[0];
  return await stakingProgram.account.globalConfig.fetch(configAccountAddress);
}

export async function getTotalSupply(tokenProgram: any): Promise<PythBalance> {
  const pythTokenMintData = await tokenProgram.account.mint.fetch(PYTH_TOKEN);
  return new PythBalance(pythTokenMintData.supply);
}

async function getAllMetadataAccounts(
  stakingProgram: Program<Staking>,
  stakeAccounts: PublicKey[]
): Promise<(IdlAccounts<Staking>["stakeAccountMetadataV2"] | null)[]> {
  const metadataAccountAddresses = stakeAccounts.map((account) =>
    getMetadataAccountAddress(account)
  );
  return stakingProgram.account.stakeAccountMetadataV2.fetchMultiple(
    metadataAccountAddresses
  );
}

async function getAllCustodyAccounts(
  tokenProgram: any,
  stakeAccounts: PublicKey[]
) {
  const allCustodyAccountAddresses = stakeAccounts.map((account) =>
    getCustodyAccountAddress(account)
  );
  return tokenProgram.account.account.fetchMultiple(allCustodyAccountAddresses);
}

// ======================================
// Locked accounts
// ======================================

function getAllLockedStakeAccounts() {
  return LOCKED_ACCOUNTS_PERIODIC_AFTER_LISTING.map(
    (account) => new PublicKey(account)
  );
}

export async function getAllLockedCustodyAccounts(
  stakingProgram: Program<Staking>,
  tokenProgram: any
): Promise<{ pubkey: PublicKey; amount: PythBalance }[]> {
  const configAccountData = await getConfig(stakingProgram);
  const allLockedStakeAccounts = getAllLockedStakeAccounts();

  const allLockedMetadataAccounts = await getAllMetadataAccounts(
    stakingProgram,
    allLockedStakeAccounts
  );

  const allLockedCustodyAccountAddresses = allLockedStakeAccounts.map(
    (account) => getCustodyAccountAddress(account)
  );
  const allLockedCustodyAccounts =
    await tokenProgram.account.account.fetchMultiple(
      allLockedCustodyAccountAddresses
    );

  return allLockedCustodyAccounts
    .map((data: any, index: number) => {
      const amount =
        data.amount && allLockedMetadataAccounts[index].lock
          ? new PythBalance(data.amount).min(
              getCurrentlyLockedAmount(
                allLockedMetadataAccounts[index],
                configAccountData
              )
            )
          : new PythBalance(new BN(0));
      return { pubkey: allLockedCustodyAccountAddresses[index], amount };
    })
    .sort((a, b) => {
      return a.amount.lte(b.amount) ? 1 : -1;
    }); // ! is safe because of the filter above
}

function getCurrentlyLockedAmount(
  metadataAccountData: IdlAccounts<Staking>["stakeAccountMetadataV2"],
  configAccountData: IdlAccounts<Staking>["globalConfig"]
): PythBalance {
  const lock = metadataAccountData.lock;
  const listTime = configAccountData.pythTokenListTime;
  if (lock.fullyVested) {
    return PythBalance.zero();
  } else if (lock.periodicVestingAfterListing) {
    if (!listTime) {
      return new PythBalance(lock.periodicVestingAfterListing.initialBalance);
    } else {
      return getCurrentlyLockedAmountPeriodic(
        listTime,
        lock.periodicVestingAfterListing.periodDuration,
        lock.periodicVestingAfterListing.numPeriods,
        lock.periodicVestingAfterListing.initialBalance
      );
    }
  } else if (lock.periodicVesting) {
    return getCurrentlyLockedAmountPeriodic(
      lock.periodicVesting.startDate,
      lock.periodicVesting.periodDuration,
      lock.periodicVesting.numPeriods,
      lock.periodicVesting.initialBalance
    );
  } else {
    throw new Error("Should be unreachable");
  }
}

function getCurrentlyLockedAmountPeriodic(
  startDate: BN,
  periodDuration: BN,
  numPeriods: BN,
  initialBalance: BN
): PythBalance {
  const currentTimestamp = new BN(Math.floor(Date.now() / 1000));
  if (currentTimestamp.lte(startDate)) {
    return new PythBalance(initialBalance);
  } else {
    const periodsElapsed = currentTimestamp.sub(startDate).div(periodDuration);
    if (periodsElapsed.gte(numPeriods)) {
      return PythBalance.zero();
    } else {
      const remainingPeriods = numPeriods.sub(periodsElapsed);
      return new PythBalance(
        remainingPeriods.mul(initialBalance).div(numPeriods)
      );
    }
  }
}

function getLockSummary(lock: any, listTime: BN | null) {
  if (lock.fullyVested) {
    return { type: "fullyUnlocked" };
  } else if (lock.periodicVestingAfterListing) {
    return {
      type: "periodicUnlockingAfterListing",
      schedule: getUnlockEvents(
        listTime,
        lock.periodicVestingAfterListing.periodDuration,
        lock.periodicVestingAfterListing.numPeriods,
        lock.periodicVestingAfterListing.initialBalance
      ),
    };
  } else if (lock.periodicVesting) {
    return {
      type: "periodicUnlocking",
      schedule: getUnlockEvents(
        lock.periodicVesting.startDate,
        lock.periodicVesting.periodDuration,
        lock.periodicVesting.numPeriods,
        lock.periodicVesting.initialBalance
      ),
    };
  }
}

function getUnlockEvents(
  startData: BN | null,
  periodDuration: BN,
  numberOfPeriods: BN,
  initialBalance: BN
) {
  if (startData) {
    return Array(numberOfPeriods.toNumber())
      .fill(0)
      .map((_, i) => {
        return {
          date: startData.add(periodDuration.muln(i + 1)).toString(),
          amount: new PythBalance(
            initialBalance.divn(numberOfPeriods.toNumber())
          ).toString(),
        };
      });
  }
  return [];
}
