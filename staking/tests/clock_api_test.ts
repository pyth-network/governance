import {
  AnchorConfig,
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  getPortNumber,
  makeDefaultConfig,
  readAnchorConfig,
  standardSetup,
} from "./utils/before";
import path from "path";
import { Keypair } from "@solana/web3.js";
import { StakeConnection } from "../app";
import assert from "assert";
import { BN } from "@coral-xyz/anchor";
import shell from "shelljs";

const portNumber = getPortNumber(path.basename(__filename));

describe("clock_api", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let stakeConnection: StakeConnection;
  let controller: CustomAbortController;

  const CLOCK_TOLERANCE_SECONDS = 10;

  let config: AnchorConfig;
  before(async () => {
    config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));
  });

  it("gets the start time (mock clock)", async () => {
    const time = await stakeConnection.getTime();
    // Default config starts the clock at 10
    assert.equal(time.toNumber(), 10);
  });
  it("advances mock clock a few times", async () => {
    await stakeConnection.program.methods.advanceClock(new BN(10)).rpc();
    assert.equal((await stakeConnection.getTime()).toNumber(), 20);

    await stakeConnection.program.methods.advanceClock(new BN(5)).rpc();
    assert.equal((await stakeConnection.getTime()).toNumber(), 25);
    assert.equal((await stakeConnection.getTime()).toNumber(), 25);
  });

  it("gets real time", async () => {
    // Delete the property, which will make the API think it's not using mock clock anymore
    stakeConnection.config.freeze = false;
    let sysTime = Date.now() / 1000;
    let solanaTime = (await stakeConnection.getTime()).toNumber();
    assert.ok(Math.abs(sysTime - solanaTime) < CLOCK_TOLERANCE_SECONDS);

    await new Promise((resolve) => setTimeout(resolve, 10000));
    sysTime = Date.now() / 1000;
    solanaTime = (await stakeConnection.getTime()).toNumber();
    assert.ok(Math.abs(sysTime - solanaTime) < CLOCK_TOLERANCE_SECONDS);
  });

  it("checks that because mock clock is enabled, deployment will fail", async () => {
    const grepResults = shell.exec(
      `grep -q MOCK_CLOCK_ENABLED ${config.path.binary_path}`
    );
    const GREP_SUCCESS = 0;
    assert.equal(grepResults.code, GREP_SUCCESS);
  });

  after(async () => {
    controller.abort();
  });
});
