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

});
