import {
  CustomAbortController,
  getPortNumber,
  standardSetup,
} from "./utils/before";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { StakeConnection } from "../app";
import { BN, Program, utils } from "@coral-xyz/anchor";
import * as wasm from "@pythnetwork/staking-wasm";
import assert from "assert";
import { Staking } from "../target/types/staking";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("create_product", async () => {
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;
  let program: Program<Staking>;
  let targetAccount: PublicKey;
  let bump: number;

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));

    program = stakeConnection.program;
  });

  it("checks governance product", async () => {
    [targetAccount, bump] = await PublicKey.findProgramAddress(
      [
        utils.bytes.utf8.encode(wasm.Constants.TARGET_SEED()),
        utils.bytes.utf8.encode(wasm.Constants.VOTING_TARGET_SEED()),
      ],
      program.programId
    );

    const productAccountData = await program.account.targetMetadata.fetch(
      targetAccount
    );

    assert.equal(
      JSON.stringify(productAccountData),
      JSON.stringify({
        bump,
        lastUpdateAt: (await stakeConnection.getTime()).div(
          stakeConnection.config.epochDuration
        ),
        prevEpochLocked: new BN(0),
        locked: new BN(0),
        deltaLocked: new BN(0),
      })
    );
  });

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });
});
