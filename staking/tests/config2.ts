import { Program, Provider, Wallet, utils } from "@project-serum/anchor";
import { PublicKey, Keypair, Transaction, Connection } from "@solana/web3.js";
import { createMint } from "./utils/before";
import BN from "bn.js";
import assert from "assert";
import fs from "fs";
import toml from "toml";
import { exec } from "child_process";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;

describe("config", async () => {
  const portNumber = 9001;

  const CONFIG_SEED = "config";

  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zeroPubkey = new PublicKey(0);

  const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

  const user = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(config.provider.wallet).toString())
    )
  );
  const ledgerDir = config.validator.ledger_dir;
  const programAddress = new PublicKey(config.programs.localnet.staking);
  const idlPath = config.build.idl_path;
  const binaryPath = config.build.binary_path;

  const connection: Connection = new Connection(
    `http://localhost:${portNumber}`,
    Provider.defaultOptions().commitment
  );

  let provider;
  let program;
  const controller = new AbortController();
  const { signal } = controller;

  let configAccount: PublicKey;
  let bump: number;

  [configAccount, bump] = await PublicKey.findProgramAddress(
    [utils.bytes.utf8.encode(CONFIG_SEED)],
    programAddress
  );

  after(async () => {
    controller.abort();
  });

  it("deploy program", async () => {
    exec(
      `mkdir -p ${ledgerDir}/${portNumber} && solana-test-validator --ledger ${ledgerDir}/${portNumber} --rpc-port ${portNumber} --faucet-port ${portNumber+1001} --mint ${
        user.publicKey
      } --reset --bpf-program  ${programAddress.toBase58()} ${binaryPath}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
      }
    );

    while (true) {
      try {
        console.log("waiting");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await connection.getEpochInfo();
        break;
      } catch (e) {}
    }

    provider = new Provider(connection, new Wallet(user), {});
    program = new Program(
      JSON.parse(fs.readFileSync(idlPath).toString()),
      programAddress,
      provider
    );
  });

  it("creates mint", async () => {
    await createMint(
      provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );
  });


  it("initializes config", async () => {
    await program.methods
      .initConfig({
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        mockClockTime: new BN(10),
      })
      .rpc({
        skipPreflight: DEBUG,
      });

    const configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        mockClockTime: new BN(10),
      })
    );
  });

  it("advances clock twice", async () => {
    await program.methods.advanceClock(new BN(5)).rpc({ skipPreflight: DEBUG });

    let configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        mockClockTime: new BN(15),
      })
    );

    await program.methods
      .advanceClock(new BN(15))
      .rpc({ skipPreflight: DEBUG });

    configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        mockClockTime: new BN(30),
      })
    );
  });
});
