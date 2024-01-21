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
import path from "path";
import { PythBalance } from "../app";
import { ProfileConnection } from "../app/ProfileConnection";
import { expectFailApi } from "./utils/utils";

const portNumber = getPortNumber(path.basename(__filename));

const EVM_TEST_ADDRESS: string = "0xb80Eb09f118ca9Df95b2DF575F68E41aC7B9E2f8";

describe("profile", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let stakeConnection: StakeConnection;
  let controller;

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
  });

  it("sets up profile", async () => {
    let profileConnection = new ProfileConnection(
      stakeConnection.provider.connection,
      stakeConnection.provider.wallet
    );
    let profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    );

    assert(profile["evm"] === undefined);
    await profileConnection.updateProfile(profile, { evm: EVM_TEST_ADDRESS });

    profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    );
    assert(profile["evm"] === EVM_TEST_ADDRESS);

    expectFailApi(
      profileConnection.updateProfile(profile, { evm: "0xdeadbeef" }),
      "Your EVM address is invalid"
    );

    await profileConnection.updateProfile(profile, { evm: undefined });
    profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    );
    assert(profile["evm"] === undefined);

    await profileConnection.updateProfile(profile, { evm: EVM_TEST_ADDRESS });

    profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    );
    assert(profile["evm"] === EVM_TEST_ADDRESS);

    await profileConnection.updateProfile(profile, { evm: "" });
    profile = await profileConnection.getProfile(
      stakeConnection.userPublicKey()
    );
    assert(profile["evm"] === undefined);
  });
});
