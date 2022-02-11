import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { createMint } from "./utils/utils";
import fs from "fs";
import os from "os";

describe("staking", async () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Staking as Program<Staking>;
  const provider = anchor.Provider.local();

  //PDAs
  const stake_account_secret = new Keypair();

  const [_stake_account_custody, _stake_account_custody_bump] =
    await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode("custody"),
        stake_account_secret.publicKey.toBuffer(),
      ],
      program.programId
    );

  const [_custody_authority, _custody_authority_bump] =
    await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode("authority"),
        stake_account_secret.publicKey.toBuffer(),
      ],
      program.programId
    );

  const my_wallet = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(
        fs.readFileSync(os.homedir + "/.config/solana/id.json").toString()
      )
    )
  );

  const PYTH_MINT_KEYPAIR = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(
        fs
          .readFileSync("./pytY8XLyKgEV13L8r8WvtqYJG2zEXdciqs3qeNt5MhY.json")
          .toString()
      )
    )
  );
  const pyth_mint_authority = new Keypair();

  it("creates staking account", async () => {
    await createMint(
      provider,
      my_wallet,
      PYTH_MINT_KEYPAIR,
      pyth_mint_authority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    const owner = provider.wallet.publicKey;

    await program.methods
      .createStakeAccount(owner, { vested: {} }, _custody_authority_bump)
      .accounts({
        stakeAccount: stake_account_secret.publicKey,
        stakeAccountCustody: _stake_account_custody,
        custodyAuthority: _custody_authority,
        mint: PYTH_MINT_KEYPAIR.publicKey,
      })
      .signers([stake_account_secret])
      .rpc();
  });

  it("deposits tokens", async () => {
    const transaction = new Transaction();
    const from_account = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      PYTH_MINT_KEYPAIR.publicKey,
      provider.wallet.publicKey
    );
    const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      PYTH_MINT_KEYPAIR.publicKey,
      from_account,
      provider.wallet.publicKey,
      provider.wallet.publicKey
    );
    transaction.add(create_ata_ix);

    // Mint 8 tokens. We'll send 6 to the custody wallet and save 2 for later.
    const mint_ix = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      PYTH_MINT_KEYPAIR.publicKey,
      from_account,
      pyth_mint_authority.publicKey,
      [],
      8
    );
    transaction.add(mint_ix);

    const to_account = _stake_account_custody;

    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from_account,
      to_account,
      provider.wallet.publicKey,
      [],
      6
    );
    transaction.add(ix);
    const tx = await provider.send(
      transaction,
      [my_wallet, pyth_mint_authority],
      { skipPreflight: true }
    );
    console.log("Your transaction signature", tx);
  });
});
