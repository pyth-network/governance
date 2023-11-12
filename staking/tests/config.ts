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
  getDummyAgreementHash,
  getDummyAgreementHash2,
} from "./utils/before";
import { expectFail, createMint, getTargetAccount } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import path from "path";
import * as wasm from "@pyth-network/staking-wasm";
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

  const pdaAuthorityKeypair = new Keypair();
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
  const pdaAuthority = pdaAuthorityKeypair.publicKey;
  const governanceProgram = new PublicKey(config.programs.localnet.governance);

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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(10),
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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(15),
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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
      })
    );
  });

  it("updates token list time", async () => {
    await program.methods
      .updateTokenListTime(new BN(5))
      .rpc({ skipPreflight: DEBUG });

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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: new BN(5),
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
      })
    );
  });

  it("create account", async () => {
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
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
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

  it("someone else tries to access admin methods", async () => {
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
      samConnection.program.methods.updateGovernanceAuthority(new PublicKey(0)),
      "An address constraint was violated",
      errMap
    );
    await expectFail(
      samConnection.program.methods.updateTokenListTime(new BN(7)),
      "An address constraint was violated",
      errMap
    );

    await expectFail(
      samConnection.program.methods.updateAgreementHash(
        Array.from(Buffer.alloc(32))
      ),
      "An address constraint was violated",
      errMap
    );
  });

  it("updates pda authority", async () => {
    // governance authority can't update pda authority
    await expectFail(
      program.methods.updatePdaAuthority(program.provider.wallet.publicKey),
      "An address constraint was violated",
      errMap
    );

    const pdaConnection = await StakeConnection.createStakeConnection(
      program.provider.connection,
      new Wallet(pdaAuthorityKeypair),
      program.programId
    );

    await pdaConnection.program.provider.connection.requestAirdrop(
      pdaAuthorityKeypair.publicKey,
      1_000_000_000_000
    );

    // Airdrops are not instant unfortunately, wait
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // pda_authority updates pda_authority to the holder of governance_authority
    await pdaConnection.program.methods
      .updatePdaAuthority(program.provider.wallet.publicKey)
      .rpc();

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
        freeze: false,
        pdaAuthority: program.provider.wallet.publicKey,
        governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
      })
    );

    // the authority gets returned to the original pda_authority
    await program.methods.updatePdaAuthority(pdaAuthority).rpc();

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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
      })
    );
  });

  it("updates agreement hash", async () => {
    assert.notEqual(
      JSON.stringify(getDummyAgreementHash()),
      JSON.stringify(getDummyAgreementHash2())
    );

    await program.methods.updateAgreementHash(getDummyAgreementHash2()).rpc();

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
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash2(),
        mockClockTime: new BN(30),
      })
    );
  });
});
