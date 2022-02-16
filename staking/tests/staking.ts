import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
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
import { createMint } from "./utils/utils";
import BN from "bn.js";

describe("staking", async () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Staking as Program<Staking>;

  const provider = anchor.Provider.local();

  const stake_account_positions_secret = new Keypair();
  const pyth_mint_account = new Keypair();
  const pyth_mint_authority = new Keypair();
  const zero_pubkey = new PublicKey(0);

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
        epochDuration: new BN(3600),
      })
      .rpc();
  });

  it("creates staking account", async () => {
    const owner = provider.wallet.publicKey;
    const SIZE = 10000;

    await program.methods
      .createStakeAccount(owner, { fullyVested: {} })
      .preInstructions([
        SystemProgram.createAccount({
          /** The account that will transfer lamports to the created account */
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: stake_account_positions_secret.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            SIZE
          ),
          space: SIZE,
          programId: program.programId,
        }),
      ])
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
        mint: pyth_mint_account.publicKey,
      })
      .signers([stake_account_positions_secret])
      .rpc({
        skipPreflight: true,
      });
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

    const to_account = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode("custody"),
          stake_account_positions_secret.publicKey.toBuffer(),
        ],
        program.programId
      )
    )[0];

    console.log(to_account.toBase58());

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

  it("creates a position", async () => {
    const tx = await program.methods
      .createPosition(zero_pubkey, zero_pubkey, new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .rpc({
        skipPreflight: true,
      });

    console.log("Your transaction signature", tx);
  });
});
