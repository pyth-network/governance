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

  const [_config_account, _config_account_bump] =
    await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("config")],
      program.programId
    );

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

  const pyth_mint_account = new Keypair();
  const pyth_mint_authority = new Keypair();

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
        unbondingDuration: 2,
      })
      .accounts({
        configAccount: _config_account,
      })
      .rpc();
  });

  it("creates staking account", async () => {
    const owner = provider.wallet.publicKey;

    await program.methods
      .createStakeAccount(
        owner,
        { vested: {} },
        _custody_authority_bump,
        _config_account_bump
      )
      .accounts({
        stakeAccount: stake_account_secret.publicKey,
        stakeAccountCustody: _stake_account_custody,
        config: _config_account,
        custodyAuthority: _custody_authority,
        mint: pyth_mint_account.publicKey,
      })
      .signers([stake_account_secret])
      .rpc();
  });

  it("deposits tokens", async () => {
    const transaction = new Transaction();
    const from_account = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      provider.wallet.publicKey
    );
    const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      from_account,
      provider.wallet.publicKey,
      provider.wallet.publicKey
    );
    transaction.add(create_ata_ix);

    // Mint 8 tokens. We'll send 6 to the custody wallet and save 2 for later.
    const mint_ix = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
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
    const tx = await provider.send(transaction, [pyth_mint_authority], {
      skipPreflight: true,
    });
    console.log("Your transaction signature", tx);
  });
});
