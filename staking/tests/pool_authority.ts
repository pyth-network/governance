import { BN, Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import { PublicKey } from "@solana/web3.js";
import { expectFail, getTargetAccount } from "./utils/utils";
import path from "path";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
  Authorities,
} from "./utils/before";
import { StakeConnection, PythBalance } from "../app";
import { Target, TargetWithParameters } from "../app/StakeConnection";
import { abortUnlessDetached } from "./utils/after";
import assert from "assert";

const portNumber = getPortNumber(path.basename(__filename));

describe("pool authority", async () => {
  let controller: CustomAbortController;
  let stakeConnection: StakeConnection;
  let program: Program<Staking>;
  let authorities: Authorities;

  const publisher = PublicKey.unique();

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });
  before(async () => {
    ({ controller, stakeConnection, authorities } = await standardSetup(
      portNumber
    ));
    program = stakeConnection.program;
  });

  it("creates vested staking account", async () => {
    await stakeConnection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("100")
    );
  });

  it("attempts to create integrity pool position", async () => {
    const stakeAccount = await stakeConnection.getMainAccount(
      stakeConnection.userPublicKey()
    );

    const targetWithParameters: TargetWithParameters = {
      integrityPool: {
        publisher,
      },
    };

    await expectFail(
      program.methods
        .createPosition(
          targetWithParameters,
          PythBalance.fromString("100").toBN()
        )
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          poolAuthority: stakeConnection.userPublicKey(),
          targetAccount: null,
        }),
      "The pool authority hasn't been passed or doesn't match the target"
    );

    await expectFail(
      program.methods
        .createPosition(
          targetWithParameters,
          PythBalance.fromString("100").toBN()
        )
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          targetAccount: null,
        }),
      "The pool authority hasn't been passed or doesn't match the target"
    );

    await program.methods
      .createPosition(
        targetWithParameters,
        PythBalance.fromString("100").toBN()
      )
      .accounts({
        stakeAccountPositions: stakeAccount.address,
        poolAuthority: authorities.poolAuthority.publicKey,
        targetAccount: null,
      })
      .signers([authorities.poolAuthority])
      .rpc();
  });

  it("attempts to close the position", async () => {
    const targetWithParameters: TargetWithParameters = {
      integrityPool: {
        publisher,
      },
    };

    let stakeAccount = await stakeConnection.getMainAccount(
      stakeConnection.userPublicKey()
    );
    assert.equal(stakeAccount.stakeAccountMetadata.nextIndex, 2); // Expecting 2 positions
    assert.deepEqual(
      stakeAccount.stakeAccountPositionsJs.positions[0].targetWithParameters,
      { voting: {} }
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[0].amount.eq(
        PythBalance.fromString("100").toBN()
      )
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[0].activationEpoch.eq(
        new BN(1)
      )
    );
    assert.equal(
      stakeAccount.stakeAccountPositionsJs.positions[0].unlockingStart,
      null
    );

    assert.deepEqual(
      stakeAccount.stakeAccountPositionsJs.positions[1].targetWithParameters,
      targetWithParameters
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[1].amount.eq(
        PythBalance.fromString("100").toBN()
      )
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[1].activationEpoch.eq(
        new BN(1)
      )
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[1].amount.eq(
        PythBalance.fromString("100").toBN()
      )
    );
    assert.equal(
      stakeAccount.stakeAccountPositionsJs.positions[1].unlockingStart,
      null
    );

    const votingTarget: Target = { voting: {} };

    await expectFail(
      program.methods
        .closePosition(
          1,
          PythBalance.fromString("100").toBN(),
          targetWithParameters
        )
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          poolAuthority: stakeConnection.userPublicKey(),
          targetAccount: null,
        }),
      "The pool authority hasn't been passed or doesn't match the target"
    );

    await expectFail(
      program.methods
        .closePosition(
          1,
          PythBalance.fromString("100").toBN(),
          targetWithParameters
        )
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          targetAccount: null,
        }),
      "The pool authority hasn't been passed or doesn't match the target"
    );

    await expectFail(
      program.methods
        .closePosition(1, PythBalance.fromString("100").toBN(), votingTarget)
        .accounts({
          stakeAccountPositions: stakeAccount.address,
          targetAccount: await getTargetAccount(program.programId),
          poolAuthority: authorities.poolAuthority.publicKey,
        })
        .signers([authorities.poolAuthority]),
      "Target in position doesn't match target in instruction data"
    );

    await program.methods
      .closePosition(
        1,
        PythBalance.fromString("100").toBN(),
        targetWithParameters
      )
      .accounts({
        stakeAccountPositions: stakeAccount.address,
        targetAccount: null,
        poolAuthority: authorities.poolAuthority.publicKey,
      })
      .signers([authorities.poolAuthority])
      .rpc();

    stakeAccount = await stakeConnection.getMainAccount(
      stakeConnection.userPublicKey()
    );
    assert.equal(stakeAccount.stakeAccountMetadata.nextIndex, 1); // Only 1 position left
    assert.deepEqual(
      stakeAccount.stakeAccountPositionsJs.positions[0].targetWithParameters,
      { voting: {} }
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[0].amount.eq(
        PythBalance.fromString("100").toBN()
      )
    );
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[0].activationEpoch.eq(
        new BN(1)
      )
    );
    assert.equal(
      stakeAccount.stakeAccountPositionsJs.positions[0].unlockingStart,
      null
    );
  });
});
