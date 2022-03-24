import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import * as wasm from "../wasm/node/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import { createMint } from "../tests/utils/utils";
import BN from "bn.js";
import fs from "fs";

describe("setup", async () => {
  let program: Program<Staking>;

  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  const alice = new Keypair();
  const bob = new Keypair();

  const aliceStakeAccount = new Keypair();
  const bobStakeAccount = new Keypair();

  const aliceAta = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pythMintAccount.publicKey,
    alice.publicKey
  );

  const bobAta = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pythMintAccount.publicKey,
    bob.publicKey
  );

  const provider = anchor.Provider.local();

  before(async () => {
    // Drop keypairs in format compatible with Phantom Wallet
    fs.writeFileSync(`./app/keypairs/alice.json`, `[${alice.secretKey.toString()}]`);
    fs.writeFileSync(`./app/keypairs/bob.json`, `[${bob.secretKey.toString()}]`);
    fs.writeFileSync(`./app/keypairs/pyth_mint.json`, JSON.stringify(pythMintAccount.publicKey.toBase58()));

    program = anchor.workspace.Staking as Program<Staking>;

    await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      1_000_000_000_000
    );
  });

  it("initializes config", async () => {
    await createMint(
      provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    await program.methods
      .initConfig({
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        unlockingDuration: 2,
        // Epoch time set to 1 second
        epochDuration: new BN(1),
      })
      .rpc();
  });

  it("alice and bob receive sol", async () => {
    for (let owner of [alice.publicKey, bob.publicKey]) {
      await provider.connection.requestAirdrop(owner, 1_000_000_000_000);
    }
  });

  it("alice and bob receive tokens", async () => {
    const transaction = new Transaction();

    for (let [owner, toAccount] of [
      [alice.publicKey, aliceAta],
      [bob.publicKey, bobAta],
    ]) {
      const createAtaIx = Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        pythMintAccount.publicKey,
        toAccount,
        owner,
        provider.wallet.publicKey
      );
      transaction.add(createAtaIx);

      // Mint 2000 tokens.
      const mintIx = Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        pythMintAccount.publicKey,
        toAccount,
        pythMintAuthority.publicKey,
        [],
        2000
      );

      transaction.add(mintIx);
    }

    const tx = await provider.send(transaction, [pythMintAuthority]);
  });

  it("alice and bob get staking accounts", async () => {
    for (let user of [
      { owner: alice.publicKey, stakeAccount: aliceStakeAccount },
      { owner: bob.publicKey, stakeAccount: bobStakeAccount },
    ]) {
      const tx = await program.methods
        .createStakeAccount(user.owner, { fullyVested: {} })
        .preInstructions([
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: user.stakeAccount.publicKey,
            lamports:
              await provider.connection.getMinimumBalanceForRentExemption(
                wasm.Constants.POSITIONS_ACCOUNT_SIZE()
              ),
            space: wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
            programId: program.programId,
          }),
        ])
        .accounts({
          stakeAccountPositions: user.stakeAccount.publicKey,
          mint: pythMintAccount.publicKey,
        })
        .signers([user.stakeAccount])
        .rpc();
    }
  });

  it("alice and bob deposit tokens", async () => {
    for (let user of [
      {
        owner: alice,
        stakeAccount: aliceStakeAccount,
        fromAccount: aliceAta,
      },
      {
        owner: bob,
        stakeAccount: bobStakeAccount,
        fromAccount: bobAta,
      },
    ]) {
      const transaction = new Transaction();

      const toAccount = (
        await PublicKey.findProgramAddress(
          [
            anchor.utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
            user.stakeAccount.publicKey.toBuffer(),
          ],
          program.programId
        )
      )[0];

      const ix = Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        user.fromAccount,
        toAccount,
        user.owner.publicKey,
        [],
        1000
      );
      transaction.add(ix);
      const tx = await provider.send(transaction, [user.owner]);
    }
  });

  it("alice and bob lock their tokens", async () => {
    for (let user of [
      {
        owner: alice,
        stakeAccount: aliceStakeAccount,
        fromAccount: aliceAta,
      },
      {
        owner: bob,
        stakeAccount: bobStakeAccount,
        fromAccount: bobAta,
      },
    ]) {
      const tx = await program.methods
        .createPosition(null, null, new BN(1))
        .accounts({
          payer: user.owner.publicKey,
          stakeAccountPositions: user.stakeAccount.publicKey,
        })
        .signers([user.owner])
        .rpc();
    }
  });
});
