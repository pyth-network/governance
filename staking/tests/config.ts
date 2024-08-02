import { Program, utils, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  startValidator,
  readAnchorConfig,
  getPortNumber,
  ANCHOR_CONFIG_PATH,
  requestPythAirdrop,
  getDummyAgreementHash,
  getDummyAgreementHash2,
  CustomAbortController,
} from "./utils/before";
import { expectFail, createMint, getTargetAccount } from "./utils/utils";
import BN from "bn.js";
import assert from "assert";
import path from "path";
import * as wasm from "@pythnetwork/staking-wasm";
import { PYTH_DECIMALS, PythBalance, StakeConnection } from "../app";
import { Target } from "../app/StakeConnection";
import { Staking } from "../target/types/staking";
import { abortUnlessDetached } from "./utils/after";

const portNumber = getPortNumber(path.basename(__filename));

describe("config", async () => {
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();
  const pythGovernanceRealm = PublicKey.unique();
  const pdaAuthorityKeypair = new Keypair();
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
  const pdaAuthority = pdaAuthorityKeypair.publicKey;
  const governanceProgram = new PublicKey(config.programs.localnet.governance);
  const votingProduct: Target = { voting: {} };
  const poolAuthority = PublicKey.unique();

  let program: Program<Staking>;
  let controller: CustomAbortController;
  let votingProductMetadataAccount: PublicKey;
  let configAccount: PublicKey;
  let bump: number;

  after(async () => {
    await abortUnlessDetached(portNumber, controller);
  });

  before(async () => {
    ({ controller, program } = await startValidator(portNumber, config));

    await createMint(
      program.provider,
      pythMintAccount,
      pythMintAuthority.publicKey,
      null,
      PYTH_DECIMALS,
      TOKEN_PROGRAM_ID
    );

    votingProductMetadataAccount = await getTargetAccount(program.programId);
  });

  it("initializes config", async () => {
    [configAccount, bump] = await PublicKey.findProgramAddress(
      [utils.bytes.utf8.encode(wasm.Constants.CONFIG_SEED())],
      program.programId
    );

    await program.methods
      .initConfig({
        bump: 0,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(10),
        poolAuthority,
      })
      .rpc();

    await program.methods
      .createTarget(votingProduct)
      .accounts({
        targetAccount: votingProductMetadataAccount,
      })
      .rpc();

    await requestPythAirdrop(
      program.provider.publicKey,
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
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(10),
        poolAuthority,
      })
    );
  });

  it("advances clock twice", async () => {
    await program.methods.advanceClock(new BN(5)).rpc();

    let configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(15),
        poolAuthority,
      })
    );

    await program.methods.advanceClock(new BN(15)).rpc();

    configAccountData = await program.account.globalConfig.fetch(configAccount);

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
        poolAuthority,
      })
    );
  });

  it("updates token list time", async () => {
    await program.methods.updateTokenListTime(new BN(5)).rpc();

    let configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: new BN(5),
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
        poolAuthority,
      })
    );

    await program.methods.updateTokenListTime(null).rpc();

    configAccountData = await program.account.globalConfig.fetch(configAccount);

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
        poolAuthority,
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
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram: governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
        poolAuthority,
      })
    );

    const owner = program.provider.publicKey;
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
      })
      .signers([stakeAccountKeypair])
      .rpc();
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
      "A has one constraint was violated"
    );
    await expectFail(
      samConnection.program.methods.updateTokenListTime(new BN(7)),
      "A has one constraint was violated"
    );

    await expectFail(
      samConnection.program.methods.updateAgreementHash(
        Array.from(Buffer.alloc(32))
      ),
      "A has one constraint was violated"
    );
  });

  it("updates pda authority", async () => {
    // governance authority can't update pda authority
    await expectFail(
      program.methods.updatePdaAuthority(program.provider.publicKey),
      "A has one constraint was violated"
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
      .updatePdaAuthority(program.provider.publicKey)
      .rpc();

    let configAccountData = await program.account.globalConfig.fetch(
      configAccount
    );

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: program.provider.publicKey,
        governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
        poolAuthority,
      })
    );

    // the authority gets returned to the original pda_authority
    await program.methods.updatePdaAuthority(pdaAuthority).rpc();

    configAccountData = await program.account.globalConfig.fetch(configAccount);

    assert.equal(
      JSON.stringify(configAccountData),
      JSON.stringify({
        bump,
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash(),
        mockClockTime: new BN(30),
        poolAuthority,
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
        governanceAuthority: program.provider.publicKey,
        pythTokenMint: pythMintAccount.publicKey,
        pythGovernanceRealm,
        unlockingDuration: 2,
        epochDuration: new BN(3600),
        freeze: false,
        pdaAuthority: pdaAuthority,
        governanceProgram,
        pythTokenListTime: null,
        agreementHash: getDummyAgreementHash2(),
        mockClockTime: new BN(30),
        poolAuthority,
      })
    );
  });
});
