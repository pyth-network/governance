import { parseIdlErrors, utils } from "@project-serum/anchor";
import {
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  startValidator,
  readAnchorConfig,
  getPortNumber,
  ANCHOR_CONFIG_PATH,
} from "./utils/before";
import BN from "bn.js";
import assert from "assert";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import path from "path";
import * as wasm from "../wasm/node/staking";
import { PYTH_DECIMALS } from "../app";
import { SystemProgram } from "@solana/web3.js";
import { expectFail } from "./utils/utils";
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

  let configAccount: PublicKey;
  let bump: number;

  after(async () => {
    controller.abort();
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
        mockClockTime: new BN(10),
      })
      .rpc({
        skipPreflight: DEBUG,
      });

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
        mockClockTime: new BN(30),
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
      })
    );

    const owner = program.provider.wallet.publicKey;
    const stakeAccountKeypair = new Keypair();
    const instructions: TransactionInstruction[] = [];

    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: stakeAccountKeypair.publicKey,
        lamports:
          await program.provider.connection.getMinimumBalanceForRentExemption(
            wasm.Constants.POSITIONS_ACCOUNT_SIZE()
          ),
        space: wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
        programId: program.programId,
      })
    );

    errMap = parseIdlErrors(program.idl);

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

  it("unfreeze", async () => {
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
      })
    );

    const owner = program.provider.wallet.publicKey;
    const stakeAccountKeypair = new Keypair();
    const instructions: TransactionInstruction[] = [];

    instructions.push(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: stakeAccountKeypair.publicKey,
        lamports:
          await program.provider.connection.getMinimumBalanceForRentExemption(
            wasm.Constants.POSITIONS_ACCOUNT_SIZE()
          ),
        space: wasm.Constants.POSITIONS_ACCOUNT_SIZE(),
        programId: program.programId,
      })
    );

    program.methods
      .createStakeAccount(owner, { fullyVested: {} })
      .preInstructions(instructions)
      .accounts({
        stakeAccountPositions: stakeAccountKeypair.publicKey,
        mint: pythMintAccount.publicKey,
      })
      .signers([stakeAccountKeypair]);
  });
});
