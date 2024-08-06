import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  CustomAbortController,
  getPortNumber,
  standardSetup,
} from "./utils/before";
import { assertBalanceMatches } from "./utils/api_utils";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { StakeConnection, PythBalance } from "../app";
import path from "path";
import { expectFail, getTargetAccount } from "./utils/utils";
import { Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import { TargetWithParameters } from "../app/StakeConnection";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("position_lifecycle", async () => {
  const votingProduct: TargetWithParameters = { voting: {} };

  let epochDuration: BN;
  let stakeAccountAddress: PublicKey;
  let program: Program<Staking>;
  let controller: CustomAbortController;
  let owner: PublicKey;
  let ownerAta: PublicKey;
  let stakeConnection: StakeConnection;
  let votingProductMetadataAccount: PublicKey;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));

    program = stakeConnection.program;
    owner = stakeConnection.provider.wallet.publicKey;

    ownerAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      stakeConnection.config.pythTokenMint,
      program.provider.publicKey,
      true
    );

    epochDuration = stakeConnection.config.epochDuration;

    votingProductMetadataAccount = await getTargetAccount(program.programId);
  });

  it("deposits tokens and locks", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("200")
    );

    stakeAccountAddress = (await stakeConnection.getMainAccount(owner)).address;

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("200") } },
      await stakeConnection.getTime()
    );
  });

  it("try to withdraw", async () => {
    await expectFail(
      program.methods
        .withdrawStake(PythBalance.fromString("101").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal"
    );
  });

  it("try closing a position for more than the position's principal", async () => {
    await expectFail(
      program.methods
        .closePosition(0, PythBalance.fromString("201").toBN(), votingProduct)
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Amount to unlock bigger than position"
    );
  });

  it("close null position", async () => {
    await expectFail(
      program.methods
        .closePosition(1, PythBalance.fromString("200").toBN(), votingProduct)
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          targetAccount: votingProductMetadataAccount,
        }),
      "Position not in use"
    );
  });

  it("close position instantly", async () => {
    await program.methods
      .closePosition(0, PythBalance.fromString("200").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  it("open a new position", async () => {
    await program.methods
      .createPosition(votingProduct, PythBalance.fromString("200").toBN())
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { locked: { locking: PythBalance.fromString("200") } },
      await stakeConnection.getTime()
    );
  });

  it("first close some", async () => {
    await program.methods
      .closePosition(0, PythBalance.fromString("10").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("190") },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );
  });

  it("one epoch passes, try closing", async () => {
    await program.methods.advanceClock(epochDuration).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("190") },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, PythBalance.fromString("50").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    // No time has passed, so preunlocking until the end of the epoch
    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          locked: PythBalance.fromString("140"),
          preunlocking: PythBalance.fromString("50"),
        },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );
  });

  it("one epoch pass, still locked", async () => {
    await program.methods.advanceClock(epochDuration.mul(new BN(1))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: {
          locked: PythBalance.fromString("140"),
          unlocking: PythBalance.fromString("50"),
        },
        withdrawable: PythBalance.fromString("10"),
      },
      await stakeConnection.getTime()
    );

    await expectFail(
      program.methods
        .withdrawStake(PythBalance.fromString("11").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal"
    );
  });

  it("one epoch pass, try withdrawing", async () => {
    await program.methods.advanceClock(epochDuration.mul(new BN(1))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("140") },
        withdrawable: PythBalance.fromString("60"),
      },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(1, PythBalance.fromString("50").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods
      .closePosition(0, PythBalance.fromString("140").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    // Make sure than closing a position twice fails
    await expectFail(
      program.methods
        .closePosition(0, PythBalance.fromString("140").toBN(), votingProduct)
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountAddress,
        }),
      "Position already unlocking"
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { preunlocking: PythBalance.fromString("140") },
        withdrawable: PythBalance.fromString("60"),
      },
      await stakeConnection.getTime()
    );

    await expectFail(
      program.methods
        .withdrawStake(PythBalance.fromString("61").toBN())
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal"
    );
  });

  it("three epoch pass, complete unlock", async () => {
    await program.methods.advanceClock(epochDuration.mul(new BN(3))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, PythBalance.fromString("140").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  it("another iteration", async () => {
    await program.methods
      .createPosition(votingProduct, PythBalance.fromString("100").toBN())
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locking: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("100"),
      },
      await stakeConnection.getTime()
    );

    await program.methods.advanceClock(epochDuration.mul(new BN(1))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {
        locked: { locked: PythBalance.fromString("100") },
        withdrawable: PythBalance.fromString("100"),
      },
      await stakeConnection.getTime()
    );

    await program.methods
      .closePosition(0, PythBalance.fromString("100").toBN(), votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc();

    await program.methods.advanceClock(epochDuration.mul(new BN(2))).rpc();

    await assertBalanceMatches(
      stakeConnection,
      owner,
      { withdrawable: PythBalance.fromString("200") },
      await stakeConnection.getTime()
    );
  });

  it("withdraws everything", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(owner);

    await expectFail(
      stakeConnection.program.methods
        .withdrawStake(PythBalance.fromString("200").toBN())
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          destination: ownerAta,
        }),
      "Insufficient balance to cover the withdrawal"
    ); // This will fail because we need to clean up the unlocked position first

    await stakeConnection.withdrawTokens(
      stakeAccount,
      PythBalance.fromString("200")
    );

    await assertBalanceMatches(
      stakeConnection,
      owner,
      {},
      await stakeConnection.getTime()
    );
  });
});
