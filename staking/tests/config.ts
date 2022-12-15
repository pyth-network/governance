import { parseIdlErrors, utils, Wallet } from "@project-serum/anchor";
import { PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
} from "@solana/spl-token";
import {
  startValidator,
  readAnchorConfig,
  getPortNumber,
  ANCHOR_CONFIG_PATH,
  requestPythAirdrop,
} from "./utils/before";
import { expectFail, createMint, getTargetAccount } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import path from "path";
import * as wasm from "../wasm/node/staking";
import { PYTH_DECIMALS, PythBalance, StakeConnection } from "../app";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("config", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const zeroPubkey = new PublicKey(0);

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  let errMap: Map<number, string>;

  let program;
  let controller;

  let stakeAccountAddress;
  let votingProductMetadataAccount;

  let configAccount: PublicKey;
  let bump: number;

  const votingProduct = { voting: {} };

  after(async () => {
    controller.abort();
  });

  before(async () => {
    ({ controller, program } = await startValidator(portNumber, config));
    errMap = parseIdlErrors(program.idl);

    await createMint(
      program.provider,
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
  });

  it("initializes config", async () => {
    [configAccount, bump] = await PublicKey.findProgramAddress(
      [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
      program.programId
    );

    await program.methods
      .initConfig({
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(10),
        pythTokenListTime: null,
      })
      .rpc({
        skipPreflight: DEBUG,
      });

    await program.methods
      .createTarget(votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
        governanceSigner: program.provider.wallet.publicKey,
      })
      .rpc();

    await requestPythAirdrop(
      program.provider.wallet.publicKey,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("100"),
      program.provider.connection
    );

    const configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(10),
        pythTokenListTime: null,
      })
    );
  });

  it("advances clock twice", async () => {
    await program.methods.advanceClock(new BN(5)).rpc({ skipPreflight: DEBUG });

    let configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(15),
        pythTokenListTime: null,
      })
    );

    await program.methods
      .advanceClock(new BN(15))
      .rpc({ skipPreflight: DEBUG });

    configAccountData = await program.account.globalConfig.fetch(configAccount);

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(30),
        pythTokenListTime: null,
      })
    );
  });

  it("updates token list time", async () => {
    await program.methods.updateTokenListTime(new BN(5)).rpc({ skipPreflight: DEBUG });

    let configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(15),
        pythTokenListTime: 5,
      })
    );

    await program.methods
      .updateTokenListTime(null)
      .rpc({ skipPreflight: DEBUG });

    configAccountData = await program.account.globalConfig.fetch(configAccount);

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(30),
        pythTokenListTime: null,
      })
    );
  });

  it("freeze", async () => {
    await program.methods.updateFreeze(true).rpc({ skipPreflight: DEBUG });

    const configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: true,
        mockClockTime: new BN(30),
        pythTokenListTime: null,
      })
    );

    const owner = program.provider.wallet.publicKey;
    const stakeAccountKeypair = new Keypair();
    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await program.account.positionData.createInstruction(
        stakeAccountKeypair,
        wasm.Constants.POSITIONS_ACCOUNT_SIZE()
      )
    );

    await expectFail(
      program.methods
        .createStakeAccount(owner, { fullyVested: {} })
        .preInstructions(instructions)
        .accounts({
          stakeAccountPositions: stakeAccountKeypair.publicKey,
          mint: pythMintAccount.publicKey,
        })
        .signers([stakeAccountKeypair]),
      "Protocol is frozen",
      errMap
    );
  });

  it("unfreeze, create account", async () => {
    await program.methods.updateFreeze(false).rpc({ skipPreflight: DEBUG });

    const configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.wallet.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm: zeroPubkey,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        mockClockTime: new BN(30),
        pythTokenListTime: null,
      })
    );

    const owner = program.provider.wallet.publicKey;
    const stakeAccountKeypair = new Keypair();
    const instructions: TransactionInstruction[] = [];

    instructions.push(
      await program.account.positionData.createInstruction(
        stakeAccountKeypair,
        wasm.Constants.POSITIONS_ACCOUNT_SIZE()
      )
    );

    await program.methods
      .createStakeAccount(owner, { fullyVested: {} })
      .preInstructions(instructions)
      .accounts({
        stakeAccountPositions: stakeAccountKeypair.publicKey,
        mint: pythMintAccount.publicKey,
      })
      .signers([stakeAccountKeypair])
      .rpc();

    stakeAccountAddress = stakeAccountKeypair.publicKey;
  });

  it("freeze again try other instructions", async () => {
    await program.methods.updateFreeze(true).rpc({ skipPreflight: DEBUG });

    const configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert(configAccountData.freeze);

    await expectFail(
      program.methods
        .createPosition(votingProduct, new BN(1))
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          targetAccount: votingProductMetadataAccount,
        })
        .signers([]),
      "Protocol is frozen",
      errMap
    );

    await expectFail(
      program.methods
        .closePosition(0, new BN(1), votingProduct)
        .accounts({
          stakeAccountPositions: stakeAccountAddress,
          targetAccount: votingProductMetadataAccount,
        })
        .signers([]),
      "Protocol is frozen",
      errMap
    );

    const toAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      program.provider.wallet.publicKey
    );

    await expectFail(
      program.methods.withdrawStake(new BN(0)).accounts({
        stakeAccountPositions: stakeAccountAddress,
        destination: toAccount,
      }),
      "Protocol is frozen",
      errMap
    );
  });

  it("someone else tries to freeze", async () => {
    const sam = new Keypair();
    const samConnection = await StakeConnection.createStakeConnection(
      program.provider.connection,
      new Wallet(sam),
      program.programId
    );

    await samConnection.program.provider.connection.requestAirdrop(
      sam.publicKey,
      1_000_000_000_000
    );

    // Airdrops are not instant unfortunately, wait
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await expectFail(
      samConnection.program.methods.updateFreeze(true),
      "An address constraint was violated",
      errMap
    );
    await expectFail(
      samConnection.program.methods.updateGovernanceAuthority(new PublicKey(0)),
      "An address constraint was violated",
      errMap
    );
  });
});
