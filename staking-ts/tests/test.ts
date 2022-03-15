import {
  Keypair,
  PublicKey,
  Connection,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { Wallet, Provider } from "@project-serum/anchor";
import assert from 'assert';
import { StakeConnection } from "../src";

// let's try to get rid of this magic constant
const staking_program = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../../staking/target/types/staking";
import { positions_account_size } from "../../staking/tests/utils/constant";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createMint } from "../../staking/tests/utils/utils";
import BN from "bn.js";

describe("api", async () => {
  let program: Program<Staking>;

  const pyth_mint_account = new Keypair();
  const pyth_mint_authority = new Keypair();

  const alice = new Keypair();

  const alice_stake_account = new Keypair();

  const alice_ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pyth_mint_account.publicKey,
    alice.publicKey
  );

  const connection: Connection = new Connection(
    "http://localhost:8899",
    Provider.defaultOptions().commitment
  );
  let stake_connection;
  const setupProvider = new Provider(connection, new Wallet(alice), {});
  // const provider = stake_connection.program.provider;

  it("initializes config", async () => {
    
    let idl;

    while (true) {
      try {
        console.log("waiting for validator");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        idl = await Program.fetchIdl(staking_program, setupProvider);
        if (idl != null) {
          break;
        }
      } catch (e) {}
    }

    const setupProgram = new Program(idl, staking_program, setupProvider);

    await connection.requestAirdrop(alice.publicKey, 1_000_000_000_000);

    await createMint(
      setupProvider,
      pyth_mint_account,
      pyth_mint_authority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    await setupProgram.methods
      .initConfig({
        governanceAuthority: setupProvider.wallet.publicKey,
        pythTokenMint: pyth_mint_account.publicKey,
        unlockingDuration: 2,
        // Epoch time set to 1 second
        epochDuration: new BN(1),
      })
      .rpc();
  });

  it("alice receive tokens", async () => {
    const transaction = new Transaction();

    const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      alice_ata,
      alice.publicKey,
      alice.publicKey
    );
    transaction.add(create_ata_ix);

    // Mint 1000 tokens.
    const mint_ix = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      alice_ata,
      pyth_mint_authority.publicKey,
      [],
      1000
    );

    transaction.add(mint_ix);

    const tx = await setupProvider.send(transaction, [
      pyth_mint_authority,
    ]);
  });

  it("creates StakeConnection", async () => {
    stake_connection = await StakeConnection.createStakeConnection(
      connection,
      new Wallet(alice),
      staking_program
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
