import {
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  getPortNumber,
  makeDefaultConfig,
  readAnchorConfig,
  requestPythAirdrop,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  StakeConnection,
  PythBalance,
  VestingAccountState,
  StakeAccount,
} from "../app";
import { BN, Wallet } from "@project-serum/anchor";
import { assertBalanceMatches, loadAndUnlock } from "./utils/api_utils";
import assert from "assert";
import { expectFailApi } from "./utils/utils";
import { expectFailGovernance } from "./utils/governance_utils";

const ONE_MONTH = new BN(3600 * 24 * 30.5);
const portNumber = getPortNumber(path.basename(__filename));

describe("vesting", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let owner: PublicKey;

  let sam = new Keypair();
  let samConnection: StakeConnection;

  let alice = new Keypair();
  let aliceConnection: StakeConnection;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.provider.wallet.publicKey;

    samConnection = await StakeConnection.createStakeConnection(
      stakeConnection.provider.connection,
      new Wallet(sam),
      stakeConnection.program.programId
    );

    aliceConnection = await StakeConnection.createStakeConnection(
      stakeConnection.provider.connection,
      new Wallet(alice),
      stakeConnection.program.programId
    );
  });

  it("create acccount with a lockup", async () => {
    await samConnection.provider.connection.requestAirdrop(
      sam.publicKey,
      1_000_000_000_000
    );
    await requestPythAirdrop(
      sam.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("200"),
      samConnection.provider.connection
    );

    const transaction = new Transaction();

    const stakeAccountKeypair = await samConnection.withCreateAccount(
      transaction.instructions,
      sam.publicKey,
      {
        periodicVesting: {
          initialBalance: PythBalance.fromString("100").toBN(),
          startDate: await stakeConnection.getTime(),
          periodDuration: ONE_MONTH,
          numPeriods: new BN(72),
        },
      }
    );

    transaction.instructions.push(
      await samConnection.buildTransferInstruction(
        stakeAccountKeypair.publicKey,
        PythBalance.fromString("100").toBN()
      )
    );

    await samConnection.provider.sendAndConfirm(
      transaction,
      [stakeAccountKeypair],
      { skipPreflight: true }
    );

    let stakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyUnlocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("100"),
        },
      },
      await samConnection.getTime()
    );

    // Sam opts into governance
    // UnvestedTokensFullyUnlocked -> UnvestedTokensFullyLocked
    await samConnection.lockAllUnvested(stakeAccount);

    stakeAccount = await samConnection.getMainAccount(sam.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    const firstUnlock = Math.floor((100 * 10 ** 6) / 72) * 10 ** -6;
    assert(
      stakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromNumber(firstUnlock).toBN())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locking: PythBalance.fromString("100"),
        },
      },
      await samConnection.getTime()
    );
  });

  it("one month minus 1 later", async () => {
    await samConnection.program.methods
      .advanceClock(ONE_MONTH.sub(EPOCH_DURATION))
      .rpc();

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("100"),
        },
      },
      await samConnection.getTime()
    );

    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    await samConnection.depositAndLockTokens(
      samStakeAccount,
      PythBalance.fromString("1")
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("100"),
        },
        locked: { locking: PythBalance.fromString("1") },
      },
      await samConnection.getTime()
    );
  });

  it("one month later", async () => {
    await samConnection.program.methods.advanceClock(EPOCH_DURATION).rpc();

    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("98.611112"),
        },
        locked: { locked: PythBalance.fromString("2.388888") },
      },
      await samConnection.getTime()
    );

    await samConnection.depositAndLockTokens(
      samStakeAccount,
      PythBalance.fromString("1")
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("98.611112"),
        },
        locked: {
          locked: PythBalance.fromString("2.388888"),
          locking: PythBalance.fromString("1"),
        },
      },
      await samConnection.getTime()
    );

    await loadAndUnlock(
      samConnection,
      sam.publicKey,
      PythBalance.fromString("1")
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("98.611112"),
        },
        locked: {
          preunlocking: PythBalance.fromString("1"),
          locked: PythBalance.fromString("1.388888"),
          locking: PythBalance.fromString("1"),
        },
      },
      await samConnection.getTime()
    );

    assert(
      samStakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromString("3.777777").toBN())
    );
  });

  it("unlock before vesting event", async () => {
    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);

    // UnvestedTokensFullyLocked -> UnvestedTokensFullyLockedExceptCooldown
    await samConnection.unlockBeforeVestingEvent(samStakeAccount);

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLockedExceptCooldown ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    assert(
      samStakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromString("0").toBN())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("96.222223"),
          locking: PythBalance.fromString("1"),
          preunlocking: PythBalance.fromString("1.388889"),
        },
        locked: {
          preunlocking: PythBalance.fromString("3.388888"),
        },
      },
      await samConnection.getTime()
    );

    await samConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(2)))
      .rpc();

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensPartiallyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    assert(
      samStakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromString("0").toBN())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("97.222223"),
          unlocked: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("3.388888"),
      },
      await samConnection.getTime()
    );

    await samConnection.program.methods
      .advanceClock(ONE_MONTH.sub(EPOCH_DURATION.mul(new BN(2))))
      .rpc();

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("97.222223"),
        },
        withdrawable: PythBalance.fromString("4.777777"),
      },
      await samConnection.getTime()
    );
  });

  it("unlock before vesting but during the last epoch", async () => {
    await samConnection.program.methods
      .advanceClock(ONE_MONTH.sub(EPOCH_DURATION))
      .rpc();

    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    assert(
      samStakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromString("1.388889").toBN())
    );

    await samConnection.unlockBeforeVestingEvent(samStakeAccount);

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLockedExceptCooldown ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    assert(
      samStakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromString("0").toBN())
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("95.833334"),
          preunlocking: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("4.777777"),
      },
      await samConnection.getTime()
    );

    await samConnection.program.methods.advanceClock(EPOCH_DURATION).rpc();

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      VestingAccountState.UnvestedTokensFullyLocked ==
        samStakeAccount.getVestingAccountState(await samConnection.getTime())
    );
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("6.166666"),
        // locked: {
        //   unlocking: PythBalance.fromString("1.388889"),
        // },
      },
      await samConnection.getTime()
    );
  });

  it("unlock all", async () => {
    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);

    await samConnection.depositAndLockTokens(
      samStakeAccount,
      PythBalance.fromString("1")
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyLocked
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("6.166666"),
        locked: {
          // unlocking: PythBalance.fromString("1.388889"),
          locking: PythBalance.fromString("1"),
        },
      },
      await samConnection.getTime()
    );

    await samConnection.program.methods.advanceClock(EPOCH_DURATION).rpc();

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyLocked
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("6.166666"),
        locked: {
          locked: PythBalance.fromString("1"),
        },
      },
      await samConnection.getTime()
    );

    // UnvestedTokensFullyLocked -> UnvestedTokensFullyUnlockedExceptCooldown
    await samConnection.unlockAll(samStakeAccount);

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          preunlocking: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("6.166666"),
        locked: {
          preunlocking: PythBalance.fromString("1"),
        },
      },
      await samConnection.getTime()
    );

    await expectFailApi(
      samConnection.lockAllUnvested(samStakeAccount),
      `Unexpected account state ${VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown}`
    );
  });

  it("check tons of transition", async () => {
    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    // UnvestedTokensFullyUnlockedExceptCooldown -> UnvestedTokensFullyUnlocked
    await samConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(2)))
      .rpc();

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyUnlocked
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    await samConnection.lockAllUnvested(samStakeAccount);
    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);

    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyLocked
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locking: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    await samConnection.unlockBeforeVestingEvent(samStakeAccount);

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locking: PythBalance.fromString("94.444445"),
          unlocked: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensPartiallyLocked
    );

    await samConnection.program.methods.advanceClock(EPOCH_DURATION).rpc();

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("94.444445"),
          unlocked: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensPartiallyLocked
    );

    // UnvestedTokensPartiallyLocked -> UnvestedTokensFullyLocked
    await samConnection.lockAllUnvested(samStakeAccount);

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("94.444445"),
          locking: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyLocked
    );

    await samConnection.unlockBeforeVestingEvent(samStakeAccount);
    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("93.055556"),
          preunlocking: PythBalance.fromString("1.388889"),
          locking: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyLockedExceptCooldown
    );

    // UnvestedTokensFullyLockedExceptCooldown -> UnvestedTokensPartiallyLocked
    await samConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(2)))
      .rpc();

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("94.444445"),
          unlocked: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensPartiallyLocked
    );

    await expectFailApi(
      samConnection.unlockBeforeVestingEvent(samStakeAccount),
      `Unexpected account state ${VestingAccountState.UnvestedTokensPartiallyLocked}`
    );

    // UnvestedTokensPartiallyLocked -> UnvestedTokensFullyUnlockedExceptCooldown
    await samConnection.unlockAll(samStakeAccount);

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          preunlocking: PythBalance.fromString("94.444445"),
          unlocked: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown
    );

    await expectFailApi(
      samConnection.lockAllUnvested(samStakeAccount),
      `Unexpected account state ${VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown}`
    );

    await samConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(2)))
      .rpc();
    await samConnection.lockAllUnvested(samStakeAccount);
    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    await samConnection.program.methods
      .advanceClock(EPOCH_DURATION.mul(new BN(1)))
      .rpc();
    await samConnection.unlockBeforeVestingEvent(samStakeAccount);

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          locked: PythBalance.fromString("94.444445"),
          preunlocking: PythBalance.fromString("1.388889"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyLockedExceptCooldown
    );

    // UnvestedTokensFullyLockedExceptCooldown -> UnvestedTokensFullyUnlockedExceptCooldown
    await samConnection.unlockAll(samStakeAccount);

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: {
          preunlocking: PythBalance.fromString("95.833334"),
        },
        withdrawable: PythBalance.fromString("7.166666"),
      },
      await samConnection.getTime()
    );

    samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      samStakeAccount.getVestingAccountState(await samConnection.getTime()) ==
        VestingAccountState.UnvestedTokensFullyUnlockedExceptCooldown
    );
  });

  it("create acccount that does not opt into governance", async () => {
    await aliceConnection.provider.connection.requestAirdrop(
      alice.publicKey,
      1_000_000_000_000
    );
    await requestPythAirdrop(
      alice.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("200"),
      aliceConnection.provider.connection
    );

    const transaction = new Transaction();

    const stakeAccountKeypair = await aliceConnection.withCreateAccount(
      transaction.instructions,
      alice.publicKey,
      {
        periodicVesting: {
          initialBalance: PythBalance.fromString("100").toBN(),
          startDate: await stakeConnection.getTime(),
          periodDuration: ONE_MONTH,
          numPeriods: new BN(72),
        },
      }
    );

    transaction.instructions.push(
      await aliceConnection.buildTransferInstruction(
        stakeAccountKeypair.publicKey,
        PythBalance.fromString("100").toBN()
      )
    );

    await aliceConnection.provider.sendAndConfirm(
      transaction,
      [stakeAccountKeypair],
      { skipPreflight: true }
    );

    let stakeAccount = await aliceConnection.getMainAccount(alice.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyUnlocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );

    assert(
      stakeAccount
        .getNetExcessGovernanceAtVesting(await samConnection.getTime())
        .eq(PythBalance.fromString("0").toBN())
    );

    await assertBalanceMatches(
      aliceConnection,
      alice.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("100"),
        },
      },
      await aliceConnection.getTime()
    );
  });

  it("once month passes, alice withdraws", async () => {
    await aliceConnection.program.methods.advanceClock(ONE_MONTH).rpc();

    await assertBalanceMatches(
      aliceConnection,
      alice.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("98.611112"),
        },
        withdrawable: PythBalance.fromString("1.388888"),
      },
      await aliceConnection.getTime()
    );

    let stakeAccount = await aliceConnection.getMainAccount(alice.publicKey);
    await expectFailApi(
      aliceConnection.withdrawTokens(
        stakeAccount,
        PythBalance.fromString("1.388889")
      ),
      "Amount exceeds withdrawable."
    );

    await aliceConnection.withdrawTokens(
      stakeAccount,
      PythBalance.fromString("1")
    );

    await assertBalanceMatches(
      aliceConnection,
      alice.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("98.611112"),
        },
        withdrawable: PythBalance.fromString("0.388888"),
      },
      await aliceConnection.getTime()
    );

    stakeAccount = await aliceConnection.getMainAccount(alice.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyUnlocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );
  });

  it("once month passes, vesting continues", async () => {
    await aliceConnection.program.methods.advanceClock(ONE_MONTH).rpc();

    await assertBalanceMatches(
      aliceConnection,
      alice.publicKey,
      {
        unvested: {
          unlocked: PythBalance.fromString("97.222223"),
        },
        withdrawable: PythBalance.fromString("1.777777"),
      },
      await aliceConnection.getTime()
    );

    let stakeAccount = await aliceConnection.getMainAccount(alice.publicKey);

    assert(
      VestingAccountState.UnvestedTokensFullyUnlocked ==
        stakeAccount.getVestingAccountState(await samConnection.getTime())
    );
  });

  after(async () => {
    controller.abort();
  });
});
