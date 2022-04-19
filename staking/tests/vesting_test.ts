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
import { StakeConnection, PythBalance } from "../app";
import { BN, Wallet } from "@project-serum/anchor";
import { assertBalanceMatches, loadAndUnlock } from "./utils/api_utils";
import assert from "assert";

const ONE_MONTH = new BN(3600 * 24 * 30.5);
const portNumber = getPortNumber(path.basename(__filename));
console.log(portNumber);

describe("vesting", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let owner: PublicKey;

  let sam = new Keypair();
  let samConnection: StakeConnection;

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
  });

  it("create acccount with a lockup", async () => {
    await samConnection.program.provider.connection.requestAirdrop(
      sam.publicKey,
      1_000_000_000_000
    );
    await requestPythAirdrop(
      sam.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("200"),
      samConnection.program.provider.connection
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

    await samConnection.program.provider.send(
      transaction,
      [stakeAccountKeypair],
      { skipPreflight: true }
    );

    let stakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      stakeAccount.isNonGovernanceVestingAccount(await samConnection.getTime())
    );

    await samConnection.program.methods
      .createPosition(
        samConnection.votingProduct,
        null,
        PythBalance.fromString("100").toBN()
      )
      .accounts({
        stakeAccountPositions: stakeAccount.address,
        productAccount: samConnection.votingProductMetadataAccount,
      })
      .rpc({ skipPreflight: true });

    stakeAccount = await samConnection.getMainAccount(sam.publicKey);
    assert(
      !stakeAccount.isNonGovernanceVestingAccount(await samConnection.getTime())
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      { unvested: PythBalance.fromString("100") },
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
      { unvested: PythBalance.fromString("100") },
      await samConnection.getTime()
    );

    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    await samConnection.depositAndLockTokens(
      samStakeAccount,
      PythBalance.fromString("1")
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: PythBalance.fromString("100"),
        locked: { locking: PythBalance.fromString("1") },
      },
      await samConnection.getTime()
    );
  });

  it("one month later", async () => {
    await samConnection.program.methods.advanceClock(EPOCH_DURATION).rpc();

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: PythBalance.fromString("98.611112"),
        locked: { locked: PythBalance.fromString("2.388888") },
      },
      await samConnection.getTime()
    );

    let samStakeAccount = await samConnection.getMainAccount(sam.publicKey);
    await samConnection.depositAndLockTokens(
      samStakeAccount,
      PythBalance.fromString("1")
    );

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: PythBalance.fromString("98.611112"),
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

    await assertBalanceMatches(
      samConnection,
      sam.publicKey,
      {
        unvested: PythBalance.fromString("98.611112"),
        locked: {
          preunlocking: PythBalance.fromString("1"),
          locked: PythBalance.fromString("1.388888"),
          locking: PythBalance.fromString("1"),
        },
      },
      await samConnection.getTime()
    );
  });

  after(async () => {
    controller.abort();
  });
});
