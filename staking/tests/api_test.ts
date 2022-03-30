import { Keypair, Connection } from "@solana/web3.js";
import assert from "assert";
import { StakeConnection, BalanceSummary } from "../app/StakeConnection";
import {
  requestPythAirdrop,
  startValidator,
  createMint,
  readAnchorConfig,
  getPortNumber,
  initConfig,
  ANCHOR_CONFIG_PATH,
} from "./utils/before";
import { Wallet, Provider } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {} from "../../staking/tests/utils/before";
import BN from "bn.js";
import path from "path";
import { getConnection } from "./utils/before";
import { expectFail, expectFailApi } from "./utils/utils";
import { assertBalanceMatches } from "./utils/api_utils";

const portNumber = getPortNumber(path.basename(__filename));

describe("api", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  const alice = new Keypair();

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  let stakeConnection: StakeConnection;

  let setupProgram;
  let controller;

  after(async () => {
    controller.abort();
  });

  it("deploy program", async () => {
    ({ controller, program: setupProgram } = await startValidator(
      portNumber,
      config
    ));
  });

  it("initializes config", async () => {
    await setupProgram.provider.connection.requestAirdrop(
      alice.publicKey,
      1_000_000_000_000
    );

    await createMint(
      setupProgram.provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    await initConfig(setupProgram, pythMintAccount.publicKey);
  });

  it("alice receive tokens", async () => {
    await requestPythAirdrop(
      alice.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      1000,
      setupProgram.provider.connection
    );
  });

  it("creates StakeConnection", async () => {
    const connection = getConnection(portNumber);

    stakeConnection = await StakeConnection.createStakeConnection(
      connection,
      new Wallet(alice),
      config.programs.localnet.staking
    );
  });

  it("alice create deposit and lock", async () => {
    await stakeConnection.depositAndLockTokens(undefined, 600);
  });

  it("find and parse stake accounts", async () => {
    const res = await stakeConnection.getStakeAccounts(alice.publicKey);

    assert.equal(res.length, 1);
    assert.equal(
      res[0].stakeAccountPositionsJs.owner.toBase58(),
      alice.publicKey.toBase58()
    );
    assert.equal(
      res[0].stakeAccountMetadata.owner.toBase58(),
      alice.publicKey.toBase58()
    );
    assert.equal(
      res[0].stakeAccountPositionsJs.positions[0].amount,
      600
    );
    assert.equal(res[0].tokenBalance.toNumber(), 600);
    await assertBalanceMatches(
      stakeConnection,
      alice.publicKey,
      { locked: { locking: 600 } },
      await stakeConnection.getTime()
    );

    await stakeConnection.depositAndLockTokens(res[0], 100);

    const after = await stakeConnection.getStakeAccounts(alice.publicKey);
    assert.equal(after.length, 1);
    assert.equal(
      after[0].stakeAccountPositionsJs.positions[1].amount,
      100
    );
    assert.equal(after[0].tokenBalance.toNumber(), 700);
    // No time has passed, but LOCKING tokens count as locked for the balance summary, so it shows as 700
    await assertBalanceMatches(
      stakeConnection,
      alice.publicKey,
      { locked: { locking: 700 } },
      await stakeConnection.getTime()
    );
  });

  it("alice unlock too much", async () => {
    const res = await stakeConnection.getStakeAccounts(alice.publicKey);
    const stakeAccount = res[0];

    await expectFailApi(
      stakeConnection.unlockTokens(stakeAccount, 701),
      "Amount greater than locked amount"
    );

    await assertBalanceMatches(
      stakeConnection,
      alice.publicKey,
      { locked: { locking: 700 } },
      await stakeConnection.getTime()
    );
  });

  it("alice unlock", async () => {
    const res = await stakeConnection.getStakeAccounts(alice.publicKey);
    const stakeAccount = res[0];

    await stakeConnection.unlockTokens(stakeAccount, 600);

    await assertBalanceMatches(
      stakeConnection,
      alice.publicKey,
      { locked: { locking: 100 }, withdrawable: 600 },
      await stakeConnection.getTime()
    );
  });

  it("alice withdraw too much", async () => {
    const res = await stakeConnection.getStakeAccounts(alice.publicKey);
    const stakeAccount = res[0];

    await expectFailApi(
      stakeConnection.withdrawTokens(stakeAccount, 601),
      "Amount exceeds withdrawable"
    );

    await assertBalanceMatches(
      stakeConnection,
      alice.publicKey,
      { locked: { locking: 100 }, withdrawable: 600 },
      await stakeConnection.getTime()
    );
  });

  it("alice withdraw", async () => {
    const res = await stakeConnection.getStakeAccounts(alice.publicKey);
    const stakeAccount = res[0];
    await stakeConnection.withdrawTokens(stakeAccount, 600);

    await assertBalanceMatches(
      stakeConnection,
      alice.publicKey,
      { locked: { locking: 100 } },
      await stakeConnection.getTime()
    );
  });
});
