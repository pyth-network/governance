import { Keypair } from "@solana/web3.js";
import assert from "assert";
import { StakeConnection } from "../app/StakeConnection";
import {
  standardSetup,
  readAnchorConfig,
  getPortNumber,
  ANCHOR_CONFIG_PATH,
  makeDefaultConfig,
} from "./utils/before";
import {} from "../../staking/tests/utils/before";
import BN from "bn.js";
import path from "path";
import { expectFailApi } from "./utils/utils";
import { assertBalanceMatches } from "./utils/api_utils";
import { PythBalance } from "../app";

const portNumber = getPortNumber(path.basename(__filename));

describe("api", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let stakeConnection: StakeConnection;

  let controller;

  let EPOCH_DURATION;
  let owner;

  after(async () => {
    controller.abort();
  });

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey),
      PythBalance.fromString("1000")
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.provider.wallet.publicKey;
  });

  it("Deposit and lock", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("600")
    );

    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("100")
    );
  });

  it("Find and parse stake accounts", async () => {
    //console.log(stakeConnection.provider.connection.rpcEndpoint);
    //while(true) {}
    const res = await stakeConnection.getStakeAccounts(owner);
    assert.equal(res.length, 2);

    const stakeAccount = await stakeConnection.getMainAccount(owner);

    assert(stakeAccount.tokenBalance.eq(PythBalance.fromString("600").toBN()));

    assert.equal(
      stakeAccount.stakeAccountPositionsJs.owner.toBase58(),
      owner.toBase58()
    );
    assert.equal(
      stakeAccount.stakeAccountMetadata.owner.toBase58(),
      owner.toBase58()
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[0].amount.eq(
        PythBalance.fromString("600").toBN()
      )
    );
    assert(stakeAccount.tokenBalance.eq(PythBalance.fromString("600").toBN()));
    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("600") } },
      await stakeConnection.getTime()
    );

    await stakeConnection.depositAndLockTokens(
      stakeAccount,
      PythBalance.fromString("100")
    );

    const afterAccount = await stakeConnection.getMainAccount(owner);

    assert(
      afterAccount.stakeAccountPositionsJs.positions[1].amount.eq(
        PythBalance.fromString("100").toBN()
      )
    );
    assert(afterAccount.tokenBalance.eq(PythBalance.fromString("700").toBN()));
    // No time has passed, but LOCKING tokens count as locked for the balance summary, so it shows as 700
    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("700") } },
      await stakeConnection.getTime()
    );
  });

  it("Unlock too much", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await expectFailApi(
      stakeConnection.unlockTokens(stakeAccount, PythBalance.fromString("701")),
      "Amount greater than locked amount"
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("700") } },
      await stakeConnection.getTime()
    );
  });

  it("Unlock", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await stakeConnection.unlockTokens(
      stakeAccount,
      PythBalance.fromString("600")
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("600"),
      },
      await stakeConnection.getTime()
    );
  });

  it("Withdraw too much", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await expectFailApi(
      stakeConnection.withdrawTokens(
        stakeAccount,
        PythBalance.fromString("601")
      ),
      "Amount exceeds withdrawable"
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("600"),
      },
      await stakeConnection.getTime()
    );
  });

  it("Withdraw", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await stakeConnection.withdrawTokens(
      stakeAccount,
      PythBalance.fromString("600")
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("100") } },
      await stakeConnection.getTime()
    );
  });
});
