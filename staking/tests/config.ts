import { utils } from "@project-serum/anchor";
import { PublicKey, Keypair, Transaction, Connection } from "@solana/web3.js";
import { createMint, startValidator } from "./utils/before";
import BN from "bn.js";
import assert from "assert";
import fs from "fs";
import toml from "toml";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = 8899;

describe("config", async () => {
  const CONFIG_SEED = "config";

  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zeroPubkey = new PublicKey(0);

  const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

  let program;
  let controller;

  let configAccount: PublicKey;
  let bump: number;

  after(async () => {
    controller.abort();
  });

  it("deploy program", async () => {
    ({ controller, program } = await startValidator(portNumber, config));
  });

  it("creates mint", async () => {
    await createMint(
      program.provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );
  });

  it("initializes config", async () => {
    [configAccount, bump] = await PublicKey.findProgramAddress(
      [utils.bytes.utf8.encode(CONFIG_SEED)],
      program.programId
    );

    await program.methods
      .initConfig({
        governanceAuthority: program.provider.wallet.publicKey,
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
        governanceAuthority: program.provider.wallet.publicKey,
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
        governanceAuthority: program.provider.wallet.publicKey,
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

    configAccountData = await program.account.globalConfig.fetch(configAccount);

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        mockClockTime: new BN(30),
      })
    );
  });
});
