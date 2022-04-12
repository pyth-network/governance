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
import { BN, Program, utils } from "@project-serum/anchor";
import * as wasm from "../wasm/node/staking";
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
  let productAccount: PublicKey;
  let bump;

  let owner: PublicKey;

  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    let globalConfig = makeDefaultConfig(pythMintAccount.publicKey);

    globalConfig.governanceAuthority = fakeGovernance.publicKey;
    globalConfig.pythGovernanceRealm = new PublicKey(0);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      globalConfig
    ));

    EPOCH_DURATION = stakeConnection.config.epochDuration;
    owner = stakeConnection.program.provider.wallet.publicKey;

    program = stakeConnection.program;
  });

  it("checks governance product", async () => {
    [productAccount, bump] = await PublicKey.findProgramAddress(
      [
        utils.bytes.utf8.encode(wasm.Constants.PRODUCT_SEED()),
        new PublicKey(0).toBuffer(),
      ],
      program.programId
    );

      await program.methods
        .createProduct(null)
        .accounts({
          productAccount,
          governanceSigner: fakeGovernance.publicKey,
        })
        .signers([fakeGovernance])
        .rpc({ skipPreflight: true });


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
