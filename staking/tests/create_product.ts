import {
  ANCHOR_CONFIG_PATH,
  getPortNumber,
  readAnchorConfig,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { StakeConnection } from "../app";
import { BN, utils } from "@project-serum/anchor";
import * as wasm from "../wasm/node/staking";
import assert from "assert";

const portNumber = getPortNumber(path.basename(__filename));

describe("create_product", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  let EPOCH_DURATION: BN;

  let stakeConnection: StakeConnection;
  let controller: AbortController;

  let program;
  let productAccount;
  let bump;

  let owner: PublicKey;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.program.provider.wallet.publicKey;

    program = stakeConnection.program;
  });

  it("creates governance product", async () => {
    [productAccount, bump] = await PublicKey.findProgramAddress(
      [
        utils.bytes.utf8.encode(wasm.Constants.PRODUCT_SEED()),
        new PublicKey(0).toBuffer(),
      ],
      program.programId
    );

    await program.methods
      .createProduct(null)
      .accounts({ productAccount })
      .rpc();

    const productAccountData = await program.account.productMetadata.fetch(
      productAccount
    );

    assert.equal(
      JSON.stringify(productAccountData),
      JSON.stringify({
        bump,
        lastUpdateAt: (await stakeConnection.getTime()).div(
          stakeConnection.config.epochDuration
        ),
        locked: new BN(0),
        deltaLocked: new BN(0),
      })
    );
  });

  after(async () => {
    controller.abort();
  });
});
