import assert from "assert";
import { StakeConnection } from "../app/StakeConnection";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
} from "./utils/before";
import path from "path";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("wallet tester", async () => {
  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });

  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));
  });

  it("tests a wallet", async () => {
    assert(
      !(await stakeConnection.walletHasTested(stakeConnection.userPublicKey()))
    );
    await stakeConnection.testWallet();
    assert(
      await stakeConnection.walletHasTested(stakeConnection.userPublicKey())
    );
    await stakeConnection.testWallet();
    assert(
      await stakeConnection.walletHasTested(stakeConnection.userPublicKey())
    );
  });
});
