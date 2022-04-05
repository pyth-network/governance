import * as anchor from "@project-serum/anchor";
import {
  parseIdlErrors,
  Program,
} from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import BN from "bn.js";
import assert from "assert";
import * as wasm from "../wasm/node/staking";
import path from "path";
import {
  readAnchorConfig,
  ANCHOR_CONFIG_PATH,
  standardSetup,
  getPortNumber,
} from "./utils/before";
import { StakeConnection } from "../app";

// When DEBUG is turned on, we turn preflight transaction checking off
// That way failed transactions show up in the explorer, which makes them
// easier to debug.
const DEBUG = true;
const portNumber = getPortNumber(path.basename(__filename));

describe("voter_weight", async () => {
  let program: Program<Staking>;
  let errMap: Map<number, string>;

  let provider: anchor.Provider;
  let voterAccount : PublicKey;

  let stakeAccountAddress : PublicKey;
  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  let EPOCH_DURATION: BN;

  let userAta: PublicKey;

  let controller : AbortController;
  let stakeConnection : StakeConnection;

  after(async () => {
    controller.abort();
  });
  before(async () => {
    const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
    
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

    await stakeConnection.depositTokens(undefined, 100);
    stakeAccountAddress = (await stakeConnection.getStakeAccounts(provider.wallet.publicKey))[0].address;

    voterAccount = (
      await PublicKey.findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode(wasm.Constants.VOTER_RECORD_SEED()),
          stakeAccountAddress.toBuffer(),
        ],
        program.programId
      )
    )[0];
  });

  async function assertVoterWeight(expectedValue: number) {
    await program.methods
      .updateVoterWeight()
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc({ skipPreflight: DEBUG });

    const voter_record = await program.account.voterWeightRecord.fetch(
      voterAccount
    );

    assert.equal(voter_record.voterWeight.toNumber(), expectedValue);
  }

  it("updates voter weight", async () => {
    // Haven't locked anything, so no voter weight
    await assertVoterWeight(0);
  });

  it("create a position and then update voter weight again", async () => {
    const tx = await program.methods
      .createPosition(null, null, new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc({
        skipPreflight: DEBUG,
      });
    // Time hasn't passed yet, so still no weight
    await assertVoterWeight(0);

    await program.methods
      .advanceClock(EPOCH_DURATION.muln(5))
      .accounts()
      .rpc({ skipPreflight: DEBUG });

    // Locked in 1 token, so voter weight is 1
    await assertVoterWeight(1);
  });

  it("unlocks and checks voter weight", async () => {
    await program.methods
      .closePosition(0, new BN(1))
      .accounts({
        stakeAccountPositions: stakeAccountAddress,
      })
      .rpc({
        skipPreflight: DEBUG,
      });
    // Still have weight until the end of the epoch
    await assertVoterWeight(1);

    await program.methods
      .advanceClock(EPOCH_DURATION.muln(1))
      .accounts()
      .rpc({ skipPreflight: DEBUG });

    await assertVoterWeight(0);
  });
});
