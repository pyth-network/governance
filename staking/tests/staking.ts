import * as anchor from "@project-serum/anchor";
import { parseIdlErrors, Program, ProgramError } from "@project-serum/anchor";
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
import { createMint, parseErrorMessage } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";

describe("staking", async () => {
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Staking as Program<Staking>;
  const DISCRIMINANT_SIZE = 8;
  const POSITION_SIZE = 96;
  const MAX_POSITIONS = 100;

  const CONFIG_SEED = "config";
  const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
  const CUSTODY_SEED = "custody";
  const AUTHORITY_SEED = "authority";

  const [config_account, bump] = await PublicKey.findProgramAddress(
    [anchor.utils.bytes.utf8.encode(CONFIG_SEED)],
    program.programId
  );

  const positions_account_size =
    POSITION_SIZE * MAX_POSITIONS + DISCRIMINANT_SIZE;

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

    const config_account_data = await program.account.globalConfig.fetch(
      config_account
    );

    assert.equal(
      JSON.stringify(config_account_data),
      JSON.stringify({
        bump,
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pyth_mint_account.publicKey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
      })
    );
  });

  it("creates vested staking account", async () => {
    const owner = provider.wallet.publicKey;

    const [metadataAccount, metadataBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(STAKE_ACCOUNT_METADATA_SEED),
        stake_account_positions_secret.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [custodyAccount, custodyBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(CUSTODY_SEED),
        stake_account_positions_secret.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [authorityAccount, authorityBump] =
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(AUTHORITY_SEED),
          stake_account_positions_secret.publicKey.toBuffer(),
        ],
        program.programId
      );

    const tx = await program.methods
      .createStakeAccount(owner, { fullyVested: {} })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: stake_account_positions_secret.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            positions_account_size
          ),
          space: positions_account_size,
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

    const stake_account_metadata_data =
      await program.account.stakeAccountMetadata.fetch(metadataAccount);

    assert.equal(
      JSON.stringify(stake_account_metadata_data),
      JSON.stringify({
        custodyBump,
        authorityBump,
        metadataBump,
        owner,
        lock: { fullyVested: {} },
      })
    );
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

    // Mint 1000 tokens. We'll send 100 to the custody wallet and save 900 for later.
    const mint_ix = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      from_account,
      pyth_mint_authority.publicKey,
      [],
      1000
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

    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from_account,
      to_account,
      provider.wallet.publicKey,
      [],
      100
    );
    transaction.add(ix);
    const tx = await provider.send(transaction, [pyth_mint_authority], {
      skipPreflight: true,
    });
  });

  it("creates a position that's too big", async () => {
    try {
      await program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(102))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        })
        .rpc({
          skipPreflight: true,
        });
    } catch (err) {
      assert.equal(
        parseErrorMessage(err, anchor.parseIdlErrors(program.idl)),
        "Insufficient balance to take on a new position"
      );
    }
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
  });

  it("creates position with 0 principal", async () => {
    try{
      const tx = await program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(0))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        })
        .rpc({
          skipPreflight: true,
        });
    }
    catch(err){
      assert.equal(
        parseErrorMessage(err, anchor.parseIdlErrors(program.idl)),
        "New position needs to have positive balance"
      );
    }
  });

  it("creates too many positions", async () => {
    for (let i = 0; i < 99; i++) {
      const tx = await program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(1))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        })
        .rpc({
          skipPreflight: true,
        });
    }

    try {
      const tx = await program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(1))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        })
        .rpc({
          skipPreflight: true,
        });
    } catch (err) {
      assert.equal(
        parseErrorMessage(err, anchor.parseIdlErrors(program.idl)),
        "Number of position limit reached"
      );
    }
  });
});
