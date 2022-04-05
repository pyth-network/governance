import * as anchor from "@project-serum/anchor";
import {IdlTypes, parseIdlErrors, Program } from "@project-serum/anchor";
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
import { expectFail } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../wasm/node/staking";
import path from 'path'
import { readAnchorConfig, ANCHOR_CONFIG_PATH, standardSetup, getPortNumber } from "./utils/before";
import { StakeConnection } from "../app";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
type Position = IdlTypes<Staking>["Position"];
const portNumber = getPortNumber(path.basename(__filename));

describe("staking", async () => {

  let program: Program<Staking>;

  let voterAccount: PublicKey;
  let errMap: Map<number, string>;

  let provider: anchor.Provider;

  const stakeAccountPositionsSecret = new Keypair();
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zeroPubkey = new PublicKey(0);
  let EPOCH_DURATION: BN;

  let userAta: PublicKey;
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  let controller : AbortController;
  let stakeConnection : StakeConnection;

  after(async () => {
    controller.abort();
  });
  before(async () => {
    
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority
    ));
    program = stakeConnection.program;
    provider = stakeConnection.program.provider;
    userAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      program.provider.wallet.publicKey
    );

    errMap = parseIdlErrors(program.idl);
    EPOCH_DURATION = stakeConnection.config.epochDuration;
  });

  it("creates vested staking account", async () => {
    const owner = provider.wallet.publicKey;

    const [metadataAccount, metadataBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(
          wasm.Constants.STAKE_ACCOUNT_METADATA_SEED()
        ),
        stakeAccountPositionsSecret.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [custodyAccount, custodyBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
        stakeAccountPositionsSecret.publicKey.toBuffer(),
      ],
      program.programId
    );

    const [authorityAccount, authorityBump] =
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(wasm.Constants.AUTHORITY_SEED()),
          stakeAccountPositionsSecret.publicKey.toBuffer(),
        ],
        program.programId
      );
    let voterBump: number;
    [voterAccount, voterBump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
        stakeAccountPositionsSecret.publicKey.toBuffer(),
      ],
      program.programId
    );

    const tx = await program.methods
      .createStakeAccount(owner, { fullyVested: {} })
      .preInstructions([
        SystemProgram.createAccount({
          fromPubkey: provider.wallet.publicKey,
          newAccountPubkey: stakeAccountPositionsSecret.publicKey,
          lamports: await provider.connection.getMinimumBalanceForRentExemption(
            wasm.Constants.POSITIONS_ACCOUNT_SIZE()
          ),
          space:  wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
          programId: program.programId,
        }),
      ])
      .accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        mint: pythMintAccount.publicKey,
      })
      .signers([stakeAccountPositionsSecret])
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
    const from_account = userAta;

    const toAccount = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(wasm.Constants.CUSTODY_SEED()),
          stakeAccountPositionsSecret.publicKey.toBuffer(),
        ],
        program.programId
      )
    )[0];

    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from_account,
      toAccount,
      provider.wallet.publicKey,
      [],
      101
    );
    transaction.add(ix);
    const tx = await provider.send(transaction, [], {
      skipPreflight: DEBUG,
    });
  });

 

  it("withdraws tokens", async () => {
    const toAccount = userAta;

    await program.methods
      .withdrawStake(new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        destination: toAccount,
      })
      .rpc({ skipPreflight: DEBUG });
  });

  it("parses positions", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(
      stakeAccountPositionsSecret.publicKey
    );

    const pd = new wasm.WasmPositionData(inbuf.data);
    const outbuffer = Buffer.alloc(pd.borshLength);
    pd.asBorsh(outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);
    for (let index = 0; index < positions.positions.length; index++) {
      assert.equal(positions.positions[index], null);
    }
  });

  it("creates a position that's too big", async () => {
    await expectFail(
      program.methods
        .createPosition(null, null, new BN(102))
        .accounts({
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "Too much exposure to governance",
      errMap
    );
  });

  it("creates a position", async () => {
    await program.methods
      .createPosition(null, null, new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      })
      .rpc({
        skipPreflight: DEBUG,
      });
  });

  it("validates position", async () => {
    const inbuf = await program.provider.connection.getAccountInfo(
      stakeAccountPositionsSecret.publicKey
    );
    let wPositions = new wasm.WasmPositionData(inbuf.data);
    const outbuffer = Buffer.alloc(wPositions.borshLength);
    wPositions.asBorsh(outbuffer);
    const positions = program.coder.accounts.decode("PositionData", outbuffer);
    assert.equal(
      JSON.stringify(positions.positions[0]),
      JSON.stringify({
        amount: new BN(1),
        activationEpoch: new BN(1),
        unlockingStart: null,
        product: null,
        publisher: null,
      })
    );
    for (let index = 1; index < positions.positions.length; index++) {
      assert.equal(positions.positions[index], null);
    }
  });

  

  it("creates position with 0 principal", async () => {
    await expectFail(
      program.methods
        .createPosition(null, null, new BN(0))
        .accounts({
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "New position needs to have positive balance",
      errMap
    );
  });

  it("creates a non-voting position", async () => {
    await expectFail(
      program.methods
        .createPosition(zeroPubkey, zeroPubkey, new BN(10))
        .accounts({
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "Not implemented",
      errMap
    );
  });
});
