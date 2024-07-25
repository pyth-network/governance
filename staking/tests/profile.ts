import assert from "assert";
import { StakeConnection } from "../app/StakeConnection";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
} from "./utils/before";
import path from "path";
import { ProfileConnection } from "../app/ProfileConnection";
import { expectFailApi } from "./utils/utils";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

const EVM_TEST_ADDRESS: string = "0xb80Eb09f118ca9Df95b2DF575F68E41aC7B9E2f8";

describe("profile", async () => {
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));
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
