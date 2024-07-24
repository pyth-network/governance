import { PublicKey } from "@solana/web3.js";
import assert from "assert";
import { StakeConnection } from "../app/StakeConnection";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
} from "./utils/before";
import path from "path";
import { expectFailApi } from "./utils/utils";
import { assertBalanceMatches } from "./utils/api_utils";
import { PythBalance } from "../app";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("api", async () => {
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;
  let owner: PublicKey;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));

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
      "Amount greater than locked amount."
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
      "Amount exceeds withdrawable."
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
