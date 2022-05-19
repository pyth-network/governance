import * as anchor from "@project-serum/anchor";
import { IdlTypes, parseIdlErrors, Program } from "@project-serum/anchor";
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
import { expectFail, getTargetAccount } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../wasm/node/staking";
import path from "path";
import {
  readAnchorConfig,
  ANCHOR_CONFIG_PATH,
  standardSetup,
  getPortNumber,
  makeDefaultConfig,
  CustomAbortController,
} from "./utils/before";
import { StakeConnection, PythBalance } from "../app";
import { PositionAccountJs } from "../app/PositionAccountJs";

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

  let provider: anchor.AnchorProvider;

  const stakeAccountPositionsSecret = new Keypair();
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zeroPubkey = new PublicKey(0);
  let EPOCH_DURATION: BN;

  let userAta: PublicKey;
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  let controller: CustomAbortController;
  let stakeConnection: StakeConnection;

  let votingProductMetadataAccount: PublicKey;
  let votingProduct;

  after(async () => {
    controller.abort();
  });
  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(
      portNumber,
      config,
      pythMintAccount,
      pythMintAuthority,
      makeDefaultConfig(pythMintAccount.publicKey)
    ));
    program = stakeConnection.program;
    provider = stakeConnection.provider;
    userAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      provider.wallet.publicKey
    );

    votingProduct = stakeConnection.votingProduct;

    votingProductMetadataAccount = await getTargetAccount(
      votingProduct,
      program.programId
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
        await program.account.positionData.createInstruction(
          stakeAccountPositionsSecret,
          wasm.Constants.POSITIONS_ACCOUNT_SIZE()
        ),
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
        nextIndex: 0,
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
    const tx = await provider.sendAndConfirm(transaction, [], {
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
    const positionAccount = new PositionAccountJs(inbuf.data, program.idl);
    for (let index = 0; index < positionAccount.positions.length; index++) {
      assert.equal(positionAccount.positions[index], null);
    }
  });

  it("creates a position that's too big", async () => {
    await expectFail(
      program.methods
        .createPosition(votingProduct, PythBalance.fromString("102").toBN())
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "Too much exposure to governance",
      errMap
    );
  });

  it("creates a position", async () => {
    await program.methods
      .createPosition(votingProduct, new BN(1))
      .accounts({
        targetAccount: votingProductMetadataAccount,
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
    const positionAccount = new PositionAccountJs(inbuf.data, program.idl);
    assert.equal(
      JSON.stringify(positionAccount.positions[0]),
      JSON.stringify({
        amount: new BN(1),
        activationEpoch: new BN(1),
        unlockingStart: null,
        targetWithParameters: votingProduct,
        reserved: [
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
          "00",
        ],
      })
    );
    for (let index = 1; index < positionAccount.positions.length; index++) {
      assert.equal(positionAccount.positions[index], null);
    }
  });

  it("creates position with 0 principal", async () => {
    await expectFail(
      program.methods
        .createPosition(votingProduct, PythBalance.fromString("0").toBN())
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "New position needs to have positive balance",
      errMap
    );
  });

  it("creates a non-voting position", async () => {
    const nonVotingStakeTarget = {
      staking: {
        product: zeroPubkey,
        publisher: { some: { address: zeroPubkey } },
      },
    };

    await expectFail(
      program.methods
        .createPosition(
          nonVotingStakeTarget,
          PythBalance.fromString("10").toBN()
        )
        .accounts({
          targetAccount: await getTargetAccount(
            nonVotingStakeTarget,
            program.programId
          ),
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "The program expected this account to be already initialized",
      errMap
    );
  });
});
