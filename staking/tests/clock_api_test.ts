import { getPortNumber, readAnchorConfig, standardSetup } from "./utils/before";
import path from "path";
import { Keypair } from "@solana/web3.js";
import { StakeConnection } from "../app";
import assert from 'assert';
import { BN } from "@project-serum/anchor";

const portNumber = getPortNumber(path.basename(__filename));

describe("clock_api", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let stakeConnection: StakeConnection;
  let controller: AbortController;

  const CUTOFF_SECONDS = 5;

  before(async () => {
    const config = readAnchorConfig("./Anchor.toml");
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));
  });

  it("gets the start time (mock clock)", async () => {
    const time = await stakeConnection.getTime();
    // Default config starts the clock at 10
    assert.equal(time.toNumber(), 10);
  });
  it("advances mock clock a few times",async () => {
    await stakeConnection.program.methods.advanceClock(new BN(10)).rpc();
    assert.equal((await stakeConnection.getTime()).toNumber(), 20);

    await stakeConnection.program.methods.advanceClock(new BN(5)).rpc();
    assert.equal((await stakeConnection.getTime()).toNumber(), 25);
    assert.equal((await stakeConnection.getTime()).toNumber(), 25);
  });

  it("gets real time",async () => {
    // Delete the property, which will make the API think it's not using mock clock anymore
    delete stakeConnection.config.mockClockTime;
    let sysTime = Date.now()/1000;
    let solanaTime = (await stakeConnection.getTime()).toNumber();
    assert.ok(Math.abs(sysTime - solanaTime) < CUTOFF_SECONDS);

    await new Promise((resolve) => setTimeout(resolve, 10000));
    assert.ok(Math.abs(sysTime - solanaTime) < CUTOFF_SECONDS);
  });

  after(async () => {
    controller.abort();
  });
});
