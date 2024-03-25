import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  getDummyAgreementHash,
  getPortNumber,
  readAnchorConfig,
  requestPythAirdrop,
  startValidator,
} from "./utils/before";
import { createMint, getTargetAccount, StakeTarget } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import path from "path";
import { PYTH_DECIMALS, PythBalance, StakeConnection } from "../app";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("config", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  const pdaAuthorityKeypair = new Keypair();
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
  const pdaAuthority = pdaAuthorityKeypair.publicKey;
  const governanceProgram = new PublicKey(config.programs.localnet.governance);

  let program: Program<any>;
  let provider: AnchorProvider;
  let controller: CustomAbortController;

  let votingProductMetadataAccount: PublicKey;

  const votingProduct: StakeTarget = { voting: {} };

  after(async () => {
    controller.abort();
  });

  before(async () => {
    ({ controller, program } = await startValidator(portNumber, config));

    provider = program.provider as AnchorProvider;

    await createMint(
      provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      PYTH_DECIMALS,
      TOKEN_PROGRAM_ID
    );

    votingProductMetadataAccount = await getTargetAccount(
      votingProduct,
      program.programId
    );

    await program.methods
      .initConfig({
        governanceAuthority: provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(10),
      })
      .rpc({
        skipPreflight: DEBUG,
      });

    await program.methods
      .createTarget(votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        governanceSigner: provider.wallet.publicKey,
      })
      .rpc();

    await requestPythAirdrop(
      provider.wallet.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("100"),
      provider.connection
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it("updates stake account owner with governance authority", async () => {
    const governanceConnection = await StakeConnection.createStakeConnection(
      program.provider.connection,
      provider.wallet as NodeWallet,
      program.programId
    );

    const newOwner = new Keypair();

    const newOwnerAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      newOwner.publicKey,
      true
    );

    const createAtaIx = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      newOwnerAta,
      newOwner.publicKey,
      pythMintAuthority.publicKey
    );

    const instructions: TransactionInstruction[] = [createAtaIx];

    const badStakeAccountAddress = await governanceConnection.withCreateAccount(
      instructions,
      newOwnerAta,
      {
        fullyVested: {},
      }
    );

    const transaction: Transaction = new Transaction();
    transaction.instructions.push(...instructions);

    await governanceConnection.program.provider.sendAndConfirm(transaction, [
      pythMintAuthority,
    ]);

    // The fix

    const recoverAccountInstruction =
      await governanceConnection.buildRecoverAccountInstruction(
        badStakeAccountAddress,
        provider.wallet.publicKey
      );
    const recoverAccountTransaction = new Transaction();
    recoverAccountTransaction.instructions.push(recoverAccountInstruction);

    await governanceConnection.program.provider.sendAndConfirm(
      recoverAccountTransaction
    );

    const fixedAccount = await governanceConnection.loadStakeAccount(
      badStakeAccountAddress
    );

    assert.equal(
      fixedAccount.stakeAccountPositionsJs.owner.toString(),
      newOwner.publicKey.toString()
    );
    assert.equal(
      fixedAccount.stakeAccountMetadata.owner.toString(),
      newOwner.publicKey.toString()
    );
  });

  it("does not update stake account owner without governance authority", async () => {
    const governanceConnection = await StakeConnection.createStakeConnection(
      program.provider.connection,
      provider.wallet as NodeWallet,
      program.programId
    );

    const alice = new Keypair();
    const aliceConnection = await StakeConnection.createStakeConnection(
      program.provider.connection,
      new Wallet(alice),
      program.programId
    );

    aliceConnection.program.provider.connection.requestAirdrop(
      alice.publicKey,
      100_000_000
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const aliceAssociatedTokenAddress = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      alice.publicKey,
      true
    );

    const createAssociatedTokenAccountInstruction =
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        pythMintAccount.publicKey,
        aliceAssociatedTokenAddress,
        alice.publicKey,
        pythMintAuthority.publicKey
      );

    const instructions: TransactionInstruction[] = [
      createAssociatedTokenAccountInstruction,
    ];

    const badStakeAccountAddress = await governanceConnection.withCreateAccount(
      instructions,
      aliceAssociatedTokenAddress,
      {
        fullyVested: {},
      }
    );

    const transaction: Transaction = new Transaction();
    transaction.instructions.push(...instructions);

    await governanceConnection.program.provider.sendAndConfirm(transaction, [
      pythMintAuthority,
    ]);

    const recoverAccountInstruction =
      await aliceConnection.buildRecoverAccountInstruction(
        badStakeAccountAddress,
        alice.publicKey
      );
    const recoverAccountTransaction = new Transaction();
    recoverAccountTransaction.instructions.push(recoverAccountInstruction);

    try {
      await aliceConnection.program.provider.sendAndConfirm(
        recoverAccountTransaction,
        undefined,
        {
          skipPreflight: DEBUG,
        }
      );
      assert.fail("Sending the transaction should throw an exception");
    } catch (e) {
      assert.match(e.message, new RegExp("2012"));
    }
  });
});
