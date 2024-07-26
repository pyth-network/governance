import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Staking } from "../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { expectFail, getTargetAccount } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "@pythnetwork/staking-wasm";
import path from "path";
import {
  standardSetup,
  getPortNumber,
  CustomAbortController,
  getDummyAgreementHash,
} from "./utils/before";
import { StakeConnection, PythBalance } from "../app";
import { PositionAccountJs } from "../app/PositionAccountJs";
import { TargetWithParameters } from "../app/StakeConnection";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("staking", async () => {
  const stakeAccountPositionsSecret = new Keypair();
  const votingProduct: TargetWithParameters = { voting: {} };

  let program: Program<Staking>;
  let provider: anchor.AnchorProvider;
  let userAta: PublicKey;
  let controller: CustomAbortController;
  let stakeConnection: StakeConnection;
  let votingProductMetadataAccount: PublicKey;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });
  before(async () => {
    ({ controller, stakeConnection } = await standardSetup(portNumber));

    program = stakeConnection.program;
    provider = stakeConnection.provider;
    userAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      stakeConnection.config.pythTokenMint,
      provider.wallet.publicKey,
      true
    );

    votingProductMetadataAccount = await getTargetAccount(
      votingProduct,
      program.programId
    );
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

    const [voterAccount, voterBump] = await PublicKey.findProgramAddress(
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
      .postInstructions([
        await program.methods
          .createVoterRecord()
          .accounts({
            stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
          })
          .instruction(),
      ])
      .accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      })
      .signers([stakeAccountPositionsSecret])
      .rpc();

    const stake_account_metadata_data =
      await program.account.stakeAccountMetadataV2.fetch(metadataAccount);

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
        transferEpoch: null,
        signedAgreementHash: null,
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

    const tx = await provider.sendAndConfirm(transaction, [], {});
  });

  it("stakes before accepting LLC agreement", async () => {
    await expectFail(
      program.methods
        .createPosition(votingProduct, PythBalance.fromString("102").toBN())
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "You need to be an LLC member to perform this action"
    );

    await expectFail(
      program.methods.updateVoterWeight({ castVote: {} }).accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      }),
      "You need to be an LLC member to perform this action"
    );
  });

  it("accepts the LLC agreement", async () => {
    await expectFail(
      program.methods.joinDaoLlc(Array.from(new Uint8Array(32))).accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      }),
      "Invalid LLC agreement"
    );

    await program.methods
      .joinDaoLlc(getDummyAgreementHash())
      .accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      })
      .rpc();
  });

  it("withdraws tokens", async () => {
    const toAccount = userAta;

    await program.methods
      .withdrawStake(new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        destination: toAccount,
      })
      .rpc();
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
      "Too much exposure to governance"
    );
  });

  it("creates a position", async () => {
    await program.methods
      .createPosition(votingProduct, new BN(1))
      .accounts({
        targetAccount: votingProductMetadataAccount,
        stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
      })
      .rpc();
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
      "New position needs to have positive balance"
    );
  });

  it("close position with 0 principal", async () => {
    await expectFail(
      program.methods
        .closePosition(0, PythBalance.fromString("0").toBN(), votingProduct)
        .accounts({
          targetAccount: votingProductMetadataAccount,
          stakeAccountPositions: stakeAccountPositionsSecret.publicKey,
        }),
      "Closing a position of 0 is not allowed"
    );
  });

  it("creates a non-voting position", async () => {
    const nonVotingStakeTarget: TargetWithParameters = {
      integrityPool: {
        poolAuthority: PublicKey.unique(),
        publisher: PublicKey.unique(),
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
      "The program expected this account to be already initialized"
    );
  });
});
