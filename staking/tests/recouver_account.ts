import {
  AnchorProvider,
  parseIdlErrors,
  Program,
  Wallet,
} from "@coral-xyz/anchor";
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
import {
  createMint,
  expectFailApi,
  getTargetAccount,
  StakeTarget,
} from "./utils/utils";
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
    // Can't we use standard setup here? I tried and it gave me errors I couldn't resolve

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

    // Why do you I get this error without this line
    // ypeError: Cannot read properties of null (reading 'data')
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

    // Why do we need to advance the clock in this test? It gives me error without it
    await program.methods.advanceClock(new BN(5)).rpc({ skipPreflight: DEBUG });
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

    // The fix

    const recoverAccountInstruction =
      await aliceConnection.buildRecoverAccountInstruction(
        badStakeAccountAddress,
        provider.wallet.publicKey
      );
    const recoverAccountTransaction = new Transaction();
    recoverAccountTransaction.instructions.push(recoverAccountInstruction);

    await expectFailApi(
      aliceConnection.program.provider.sendAndConfirm(
        recoverAccountTransaction
      ),
      "Signature verification failed"
    );
  });
});
