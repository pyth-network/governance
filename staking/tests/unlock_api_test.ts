import {
  CustomAbortController,
  getPortNumber,
  standardSetup,
} from "./utils/before";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { StakeConnection, PythBalance } from "../app";
import { BN } from "@coral-xyz/anchor";
import { assertBalanceMatches, loadAndUnlock } from "./utils/api_utils";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("unlock_api", async () => {
  let epochDuration: BN;
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;
  let stakeAccountAddress: PublicKey;
  let owner: PublicKey;

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));

    epochDuration = stakeConnection.config.epochDuration;
    owner = stakeConnection.program.provider.publicKey;
  });

  it("deposit, lock, unlock, same epoch", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("100")
    );

    stakeAccountAddress = (await stakeConnection.getMainAccount(owner)).address;

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("100") } },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, PythBalance.fromString("50"));

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("50") },
        withdrawable: PythBalance.fromString("50"),
      },
      await stakeConnection.getTime()
    );

    await stakeConnection.program.methods
      .advanceClock(epochDuration.mul(new BN(3)))
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("50") },
        withdrawable: PythBalance.fromString("50"),
      },
      await stakeConnection.getTime()
    );
  });

  it("deposit more, unlock first unlocks oldest position (FIFO)", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await stakeConnection.depositAndLockTokens(
      stakeAccount,
      PythBalance.fromString("100")
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          locking: PythBalance.fromString("100"),
          locked: PythBalance.fromString("50"),
        },
        withdrawable: PythBalance.fromString("50"),
      },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, PythBalance.fromString("50"));

    // The tokens are preunlocking until the end of the epoch

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          preunlocking: PythBalance.fromString("50"),
          locking: PythBalance.fromString("100"),
        },
        withdrawable: PythBalance.fromString("50"),
      },
      await stakeConnection.getTime()
    );
  });

  it("time passes, first position becomes unlocked, now unlock targets second position", async () => {
    await stakeConnection.program.methods
      .advanceClock(epochDuration.mul(new BN(1)))
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          unlocking: PythBalance.fromString("50"),
          locked: PythBalance.fromString("100"),
        },
        withdrawable: PythBalance.fromString("50"),
      },
      await stakeConnection.getTime()
    );

    await stakeConnection.program.methods
      .advanceClock(epochDuration.mul(new BN(3)))
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        withdrawable: PythBalance.fromString("100"),
        locked: { locked: PythBalance.fromString("100") },
      },
      await stakeConnection.getTime()
    );

    await loadAndUnlock(stakeConnection, owner, PythBalance.fromString("100"));

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { preunlocking: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("100"),
      },
      await stakeConnection.getTime()
    );
  });

  it("time passes, all is withdrawable now", async () => {
    await stakeConnection.program.methods
      .advanceClock(epochDuration.mul(new BN(3)))
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });
});
