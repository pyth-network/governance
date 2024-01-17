import { Keypair, PublicKey } from "@solana/web3.js";
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
import { PythBalance, WALLET_TESTER_ADDRESS } from "../app";

const portNumber = getPortNumber(path.basename(__filename));

describe("wallet tester", async () => {
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

  it("tests a wallet", async () => {
    const receiptAddress: PublicKey = PublicKey.findProgramAddressSync(
      [stakeConnection.userPublicKey().toBytes()],
      WALLET_TESTER_ADDRESS
    )[0];
    let receipt = await stakeConnection.provider.connection.getAccountInfo(
      receiptAddress
    );
    assert(receipt === null);
    await stakeConnection.testWallet();
    receipt = await stakeConnection.provider.connection.getAccountInfo(
      receiptAddress
    );
    assert(receipt !== null);
    await stakeConnection.testWallet();
    receipt = await stakeConnection.provider.connection.getAccountInfo(
      receiptAddress
    );
    assert(receipt !== null);
  });
});
