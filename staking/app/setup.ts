import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import { positions_account_size } from "../tests/utils/constant";
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
import fs from "fs"
import assert from "assert"

describe("setup", async () => {
  let program: Program<Staking>;

  const pyth_mint_account = new Keypair();
  const pyth_mint_authority = new Keypair();

  const alice = new Keypair();
  const bob = new Keypair();

  const alice_stake_account = new Keypair();
  const bob_stake_account = new Keypair();

  const alice_ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pyth_mint_account.publicKey,
    alice.publicKey
  );

  const bob_ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pyth_mint_account.publicKey,
    bob.publicKey
  );

  const provider = anchor.Provider.local();

  before(async () => {

    fs.writeFileSync(`./app/keypairs/alice.json`, JSON.stringify(alice));
    fs.writeFileSync(`./app/keypairs/bob.json`, JSON.stringify(bob));
    fs.writeFileSync(`./app/keypairs/pyth_mint.json`, JSON.stringify(pyth_mint_account.publicKey.toBase58()));

    program = anchor.workspace.Staking as Program<Staking>;

    await provider.connection.requestAirdrop(provider.wallet.publicKey, 1_000_000_000_000);

  });

  it("initializes config", async () => {
    await createMint(
      provider,
      pyth_mint_account,
      pyth_mint_authority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    await program.methods
      .initConfig({
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pyth_mint_account.publicKey,
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

    for (let [owner, to_account] of [
      [alice.publicKey, alice_ata],
      [bob.publicKey, bob_ata],
    ]) {
      const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        pyth_mint_account.publicKey,
        to_account,
        owner,
        provider.wallet.publicKey
      );
      transaction.add(create_ata_ix);

      // Mint 1000 tokens.
      const mint_ix = Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        pyth_mint_account.publicKey,
        to_account,
        pyth_mint_authority.publicKey,
        [],
        1000
      );

      transaction.add(mint_ix);
    }

    const tx = await provider.send(transaction, [pyth_mint_authority]);
  });

  it("alice and bob get staking accounts", async () => {
    for (let user of [
      { owner: alice.publicKey, stake_account: alice_stake_account },
      { owner: bob.publicKey, stake_account: bob_stake_account },
    ]) {
      const tx = await program.methods
        .createStakeAccount(user.owner, { fullyVested: {} })
        .preInstructions([
          SystemProgram.createAccount({
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: user.stake_account.publicKey,
            lamports:
              await provider.connection.getMinimumBalanceForRentExemption(
                positions_account_size
              ),
            space: positions_account_size,
            programId: program.programId,
          }),
        ])
        .accounts({
          stakeAccountPositions: user.stake_account.publicKey,
          mint: pyth_mint_account.publicKey,
        })
        .signers([user.stake_account])
        .rpc();
    }
  });

  it("alice and bob deposit tokens", async () => {
    for (let user of [
      {
        owner: alice,
        stake_account: alice_stake_account,
        from_account: alice_ata,
      },
      {
        owner: bob,
        stake_account: bob_stake_account,
        from_account: bob_ata,
      },
    ]) {
      const transaction = new Transaction();

      const to_account = (
        await PublicKey.findProgramAddress(
          [
            anchor.utils.bytes.utf8.encode("custody"),
            user.stake_account.publicKey.toBuffer(),
          ],
          program.programId
        )
      )[0];

      const ix = Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        user.from_account,
        to_account,
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
        stake_account: alice_stake_account,
        from_account: alice_ata,
      },
      {
        owner: bob,
        stake_account: bob_stake_account,
        from_account: bob_ata,
      },
    ]) {
      const tx = await program.methods
        .createPosition(null, null, new BN(1))
        .accounts({
          payer: user.owner.publicKey,
          stakeAccountPositions: user.stake_account.publicKey,
        })
        .signers([user.owner])
        .rpc();
    }
  });
});
