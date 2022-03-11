import * as anchor from "@project-serum/anchor";
import { Program, Spl } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import { positions_account_size } from "./utils/constant";
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
import { createMint, expect_fail } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../node-wasm/staking"

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;

describe("staking", async () => {
  let program: Program<Staking>;

  let config_account: PublicKey;
  let voterAccount: PublicKey;
  let bump: number;
  let errMap: Map<number, string>;



  const CONFIG_SEED = "config";
  const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
  const CUSTODY_SEED = "custody";
  const AUTHORITY_SEED = "authority";
  const VOTER_SEED = "voter_weight";



  const provider = anchor.Provider.local();

  const stake_account_positions_secret = new Keypair();
  const pyth_mint_account = new Keypair();
  const pyth_mint_authority = new Keypair();
  const zero_pubkey = new PublicKey(0);

  const user_ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    pyth_mint_account.publicKey,
    provider.wallet.publicKey
  );

  before(async () => {
    anchor.setProvider(anchor.Provider.env());
    program = anchor.workspace.Staking as Program<Staking>;

    [config_account, bump] = await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode(CONFIG_SEED)],
      program.programId
    );
    let voterBump = 0;
    [voterAccount, voterBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(VOTER_SEED),
        stake_account_positions_secret.publicKey.toBuffer(),
      ],
      program.programId
    );

    errMap = anchor.parseIdlErrors(program.idl);
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
        epochDuration: new BN(3600),
        mockClockTime: new BN(10)
      })
      .rpc({
        skipPreflight: DEBUG,
      });

    const config_account_data = await program.account.globalConfig.fetch(
      config_account
    );

    assert.equal(
      JSON.stringify(config_account_data),
      JSON.stringify({
        bump,
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pyth_mint_account.publicKey,
        pythGovernanceRealm: zero_pubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        mockClockTime: new BN(10)
      })
    );
  });
  it("advances clock", async() => {
    await program.methods
    .advanceClock(new BN(5))
    .accounts(
      {   
        stakeAccountPositions: stake_account_positions_secret.publicKey,
        mint: pyth_mint_account.publicKey,
      }
    )
    .rpc({ skipPreflight: DEBUG });
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

    const [voterAccount, voterBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(VOTER_SEED),
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
        skipPreflight: DEBUG,
      });

    const stake_account_metadata_data =
      await program.account.stakeAccountMetadata.fetch(metadataAccount);

    assert.equal(
      JSON.stringify(stake_account_metadata_data),
      JSON.stringify({
        metadataBump,
        custodyBump,
        authorityBump,
        voterBump,
        owner,
        lock: { fullyVested: {} },
      })
    );
  });

  it("deposits tokens", async () => {
    const transaction = new Transaction();
    const from_account = user_ata;

    const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pyth_mint_account.publicKey,
      from_account,
      provider.wallet.publicKey,
      provider.wallet.publicKey
    );
    transaction.add(create_ata_ix);

    // Mint 1000 tokens. We'll send 101 to the custody wallet and save 899 for later.
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
      101
    );
    transaction.add(ix);
    const tx = await provider.send(transaction, [pyth_mint_authority], {
      skipPreflight: DEBUG,
    });
  });

  it("updates voter weight", async () => {
    await program.methods
      .updateVoterWeight()
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .rpc({ skipPreflight: DEBUG });

    
    const voter_record = await program.account.voterWeightRecord.fetch(voterAccount);
    // Haven't locked anything, so no voter weight
    assert.equal(voter_record.voterWeight.toNumber(), 0);
  });

  it("withdraws tokens", async () => {
    const to_account = user_ata;

    await program.methods
      .withdrawStake(new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
        destination: to_account,
      })
      .rpc({ skipPreflight: DEBUG });
  });

  it("parses positions", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(stake_account_positions_secret.publicKey);
    const outbuffer = Buffer.alloc(10*1024);
    wasm.convert_positions_account(inbuf.data, outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);
    for (let index = 0; index < positions.positions.length; index++) {
      assert.equal(positions.positions[index], null);
    }
  });

  it("creates a position that's too big", async () => {
    expect_fail(
      program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(102))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "Insufficient balance to take on a new position",
      errMap
    );
  });

  it("creates a position", async () => {
    const tx = await program.methods
      .createPosition(null, null, new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .rpc({
        skipPreflight: DEBUG,
      });
  });

  it("validates position", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(stake_account_positions_secret.publicKey);
    const outbuffer = Buffer.alloc(10*1024);
    wasm.convert_positions_account(inbuf.data, outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);

    // TODO: Once we merge the mock clock branch and control the activationEpoch, replace with struct equality
    assert.equal(positions.positions[0].amount.toNumber(), new BN(1).toNumber());
    assert.equal(positions.positions[0].product, null);
    assert.equal(positions.positions[0].publisher, null);
    assert.equal(positions.positions[0].unlockingStart, null);
    for (let index = 1; index < positions.positions.length; index++) {
      assert.equal(positions.positions[index], null);
    }
  });

  it("updates voter weight again", async () => {
    await program.methods
      .advanceClock(new BN(5*3600))
      .accounts()
      .rpc({ skipPreflight: DEBUG });

    await program.methods
      .updateVoterWeight()
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .rpc({ skipPreflight: DEBUG });

    
    const voter_record = await program.account.voterWeightRecord.fetch(voterAccount);
    // Locked in 1 token, so voter weight is 1  
    assert.equal(voter_record.voterWeight.toNumber(), 1);
  });

  it("creates position with 0 principal", async () => {
    expect_fail(
      program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(0))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "New position needs to have positive balance",
      errMap
    );
  });

  it("creates too many positions", async () => {
    let createPosIx = await program.methods
      .createPosition(zero_pubkey, zero_pubkey, new BN(1))
      .accounts({
        stakeAccountPositions: stake_account_positions_secret.publicKey,
      })
      .instruction();

    // We are starting with 1 position and want to create 99 more
    let budgetRemaining = 200_000;
    let ixCost = 19100;
    let maxInstructions = 10; // Based on txn size
    let deltaCost = 510; // adding more positions increases the cost

    let transaction = new Transaction();
    for (let numPositions = 0; numPositions < 99; numPositions++) {
      if (
        budgetRemaining < ixCost ||
        transaction.instructions.length == maxInstructions
      ) {
        let txHash = await provider.send(transaction, [], {
          skipPreflight: DEBUG,
        });
        console.log(numPositions, txHash);
        transaction = new Transaction();
        budgetRemaining = 200_000;
      }
      transaction.instructions.push(createPosIx);
      budgetRemaining -= ixCost;
      ixCost += deltaCost;
    }
    await provider.send(transaction, [], {
      skipPreflight: DEBUG,
    });

    // Now create 101, which is supposed to fail
    expect_fail(
      program.methods
        .createPosition(zero_pubkey, zero_pubkey, new BN(1))
        .accounts({
          stakeAccountPositions: stake_account_positions_secret.publicKey,
        }),
      "Number of position limit reached",
      errMap
    );
  });
});
