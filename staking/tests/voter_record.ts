// import * as anchor from "@project-serum/anchor";
// import toml from "toml";
// import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
// import {
//   startValidator,
//   createMint,
//   requestPythAirdrop,
//   createStakeAccount,
//   initConfig,
//   depositTokens,
// } from "./utils/before";
// import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
// import BN from "bn.js";
// import assert from "assert";
// import fs from "fs";

// const portNumber = 8909;
// const DEBUG = false;

// describe("voter_record", async () => {
//   const CONFIG_SEED = "config";
//   const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
//   const CUSTODY_SEED = "custody";
//   const AUTHORITY_SEED = "authority";
//   const VOTER_SEED = "voter_weight";

//   const pythMintAccount = new Keypair();
//   const pythMintAuthority = new Keypair();

//   const stakeAccountPositionSecret = new Keypair();

//   const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

//   let program;
//   let controller;

//   let voterAccount: PublicKey;
//   let owner;

//   let errMap: Map<number, string>;

//   after(async () => {
//     controller.abort();
//   });

//   before(async () => {
//     ({ controller, program } = await startValidator(portNumber, config));

//     owner = program.provider.wallet.publicKey;
//     errMap = anchor.parseIdlErrors(program.idl);

//     await createMint(
//       program.provider,
//       pythMintAccount,
//       pythMintAuthority.publicKey,
//       null,
//       0,
//       TOKEN_PROGRAM_ID
//     );

//     await requestPythAirdrop(
//       owner,
//       pythMintAccount.publicKey,
//       pythMintAuthority,
//       200,
//       program.provider.connection
//     );

//     await initConfig(program, pythMintAccount.publicKey);

//     await createStakeAccount(
//       program,
//       stakeAccountPositionSecret,
//       pythMintAccount.publicKey
//     );

//     await depositTokens(
//       program,
//       stakeAccountPositionSecret.publicKey,
//       pythMintAccount.publicKey,
//       101
//     );

//     voterAccount = (await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(VOTER_SEED),
//         stakeAccountPositionSecret.publicKey.toBuffer(),
//       ],
//       program.programId
//     ))[0];

//   });

//   it("updates voter weight", async () => {
//     await program.methods
//       .updateVoterWeight()
//       .accounts({
//         stakeAccountPositions: stakeAccountPositionSecret.publicKey,
//       })
//       .rpc({ skipPreflight: DEBUG });

//     const voterRecord = await program.account.voterWeightRecord.fetch(
//       voterAccount
//     );
//     // Haven't locked anything, so no voter weight
//     assert.equal(voterRecord.voterWeight.toNumber(), 0);
//   });

//   it("creates a position", async () => {
//     const tx = await program.methods
//       .createPosition(null, null, new BN(1))
//       .accounts({
//         stakeAccountPositions: stakeAccountPositionSecret.publicKey,
//       })
//       .rpc({
//         skipPreflight: DEBUG,
//       });
//   });

//   it("updates voter weight again", async () => {
//     await program.methods
//       .advanceClock(new BN(5 * 3600))
//       .accounts()
//       .rpc({ skipPreflight: DEBUG });

//     await program.methods
//       .updateVoterWeight()
//       .accounts({
//         stakeAccountPositions: stakeAccountPositionSecret.publicKey,
//       })
//       .rpc({ skipPreflight: DEBUG });

//     const voterRecord = await program.account.voterWeightRecord.fetch(
//       voterAccount
//     );
//     // Locked in 1 token, so voter weight is 1
//     assert.equal(voterRecord.voterWeight.toNumber(), 1);
//   });
// });
