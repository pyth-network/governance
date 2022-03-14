import {
  Keypair,
  PublicKey,
  Connection,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { Wallet, Provider } from "@project-serum/anchor";
import fs from "fs";
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

  // const provider = stake_connection.program.provider;

  it("initializes config", async () => {
    const provider = new Provider(
      connection,
      new Wallet(alice),
      Provider.defaultOptions()
    );
    let idl;

    while (true) {
      try {
        console.log("waiting for validator");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        idl = await Program.fetchIdl(staking_program, provider);
        if (idl != null) {
          break;
        }
      } catch (e) {}
    }

    const program = new Program(idl, staking_program, provider);

    await connection.requestAirdrop(alice.publicKey, 1_000_000_000_000);

    await createMint(
      provider,
      pyth_mint_account,
      pyth_mint_authority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    const tx = await program.methods
      .initConfig({
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pyth_mint_account.publicKey,
        unlockingDuration: 2,
        // Epoch time set to 1 second
        epochDuration: new BN(1),
      })
      .rpc();
    console.log(tx);
  });

  it("creates StakeConnection", async () => {
    stake_connection = await StakeConnection.createStakeConnection(
      connection,
      new Wallet(alice),
      staking_program
    );
  });

  // it("alice receive sol", async () => {

  //     await provider.connection.requestAirdrop(alice.publicKey, 1_000_000_000_000);

  // });

  it("alice receive tokens", async () => {
    const transaction = new Transaction();

    const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      alice_ata,
      alice.publicKey,
      stake_connection.program.provider.wallet.publicKey
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

    const tx = await stake_connection.program.provider.send(transaction, [
      pyth_mint_authority,
    ]);
  });

  it("alice gets staking accounts", async () => {
    const tx = await stake_connection.program.methods
      .createStakeAccount(alice.publicKey, { fullyVested: {} })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: stake_connection.program.provider.wallet.publicKey,
          newAccountPubkey: alice_stake_account.publicKey,
          lamports:
            await stake_connection.program.provider.connection.getMinimumBalanceForRentExemption(
              positions_account_size
            ),
          space: positions_account_size,
          programId: stake_connection.program.programId,
        }),
      ])
      .accounts({
        stakeAccountPositions: alice_stake_account.publicKey,
        mint: pyth_mint_account.publicKey,
      })
      .signers([alice_stake_account])
      .rpc({ skipPreflight: true });
  });

  it("alice deposit token", async () => {
    const transaction = new Transaction();

    const to_account = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode("custody"),
          alice_stake_account.publicKey.toBuffer(),
        ],
        stake_connection.program.programId
      )
    )[0];

    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      alice_ata,
      to_account,
      alice.publicKey,
      [],
      1000
    );
    transaction.add(ix);
    const tx = await stake_connection.program.provider.send(transaction, [
      alice,
    ]);
  });

  it("parses accounts", async () => {
    const res = await stake_connection.getStakeAccounts(alice.publicKey);
  });
});
