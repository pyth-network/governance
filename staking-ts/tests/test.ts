import {
  Keypair,
  PublicKey,
  Connection,
} from "@solana/web3.js";
import assert from 'assert';
import { StakeConnection } from "../src";
import {requestPythAirdrop, startValidator} from "../../staking/tests/utils/before"
import { Wallet, Provider } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createMint } from "../../staking/tests/utils/before";
import BN from "bn.js";
import fs from 'fs';
import toml from "toml";

const portNumber = 8903;

describe("api", async () => {

  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  
  const alice = new Keypair();

  const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

  let stake_connection;

  let setupProgram;
  let controller;

  after(async () => {
    controller.abort();
  });


  it("deploy program", async () => {
    ({ controller, program : setupProgram } = await startValidator(portNumber, config)); 
  });

  it("initializes config", async () => {

    await setupProgram.provider.connection.requestAirdrop(alice.publicKey, 1_000_000_000_000);

    await createMint(
      setupProgram.provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    const tx = await setupProgram.methods
      .initConfig({
        governanceAuthority: setupProgram.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        unlockingDuration: 2,
        // Epoch time set to 1 second
        epochDuration: new BN(1),
      })
      .rpc();
  });

  it("alice receive tokens", async () => {
    await requestPythAirdrop(alice.publicKey, pythMintAccount.publicKey, pythMintAuthority, 1000, setupProgram.provider.connection);
  });

  it("creates StakeConnection", async () => {

    const connection = new Connection(`http://localhost:${portNumber}`, Provider.defaultOptions().commitment);

    stake_connection = await StakeConnection.createStakeConnection(
      connection,
      new Wallet(alice),
      config.programs.localnet.staking
    );

    
  });

  it("alice create deposit and lock", async () =>{
    await stake_connection.depositAndLockTokens(undefined, 600);
  })

  it("find and parse stake accounts", async () => {
    const res = await stake_connection.getStakeAccounts(alice.publicKey);

    
    assert.equal(res.length, 1);
    assert.equal(res[0].stake_account_positions.owner.toBase58(), alice.publicKey.toBase58());
    assert.equal(res[0].stake_account_metadata.owner.toBase58(), alice.publicKey.toBase58());
    assert.equal(res[0].stake_account_positions.positions[0].amount.toNumber(), 600);
    assert.equal(res[0].token_balance.toNumber(), 600)

    await stake_connection.depositAndLockTokens(res[0], 100);

    const after = await stake_connection.getStakeAccounts(alice.publicKey);
    assert.equal(after.length, 1);
    assert.equal(after[0].stake_account_positions.positions[1].amount.toNumber(), 100);
    assert.equal(after[0].token_balance.toNumber(), 700)
    
  });

});
