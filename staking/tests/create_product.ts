import {
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  getPortNumber,
  makeDefaultConfig,
  readAnchorConfig,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { StakeConnection } from "../app";
import { BN, Program, utils } from "@coral-xyz/anchor";
import * as wasm from "@pythnetwork/staking-wasm";
import assert from "assert";
import { Staking } from "../target/types/staking";

const portNumber = getPortNumber(path.basename(__filename));

describe("create_product", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  // Governance has to sign for these instructions, but that's a lot to add to this test,
  // so we'll just fake it with a keypair
  const fakeGovernance = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  let program: Program<Staking>;
  let targetAccount: PublicKey;
  let bump;

  let owner: PublicKey;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    let globalConfig = makeDefaultConfig(pythMintAccount.publicKey);

    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      globalConfig
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.provider.wallet.publicKey;

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
    controller.abort();
  });
});
