// import * as anchor from "@project-serum/anchor";
// import {
//   TOKEN_PROGRAM_ID,
//   Token,
//   ASSOCIATED_TOKEN_PROGRAM_ID,
// } from "@solana/spl-token";
// import {
//   startValidator,
//   createMint,
//   requestPythAirdrop,
//   initConfig,
//   readAnchorConfig,
//   getPortNumber
// } from "./utils/before";
// import {
//   PublicKey,
//   Keypair,
//   Transaction,
//   Connection,
//   TransactionInstruction,
// } from "@solana/web3.js";
// import * as wasm from "../wasm/node/staking";
// import BN from "bn.js";
// import assert from "assert";
// import { StakeConnection } from "../../staking-ts/";
// import path from 'path';

// const DEBUG = true;
// const portNumber = getPortNumber(path.basename(__filename));
// console.log(portNumber);

// describe("create_stake_account", async () => {
//   const CONFIG_SEED = "config";
//   const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
//   const CUSTODY_SEED = "custody";
//   const AUTHORITY_SEED = "authority";
//   const VOTER_SEED = "voter_weight";

//   const pythMintAccount = new Keypair();
//   const pythMintAuthority = new Keypair();
//   const zeroPubkey = new PublicKey(0);

//   let stakeAccountPositionSecret: Keypair;

//   const config = readAnchorConfig("./");

//   let program;
//   let controller;

//   let owner;
//   let owner_ata;

//   let stakeConnection: StakeConnection;

//   after(async () => {
//     controller.abort();
//   });

//   before(async () => {
//     ({ controller, program } = await startValidator(portNumber, config));

//     await createMint(
//       program.provider,
//       pythMintAccount,
//       pythMintAuthority.publicKey,
//       null,
//       0,
//       TOKEN_PROGRAM_ID
//     );

//     owner = program.provider.wallet.publicKey;

//     owner_ata = await Token.getAssociatedTokenAddress(
//       ASSOCIATED_TOKEN_PROGRAM_ID,
//       TOKEN_PROGRAM_ID,
//       pythMintAccount.publicKey,
//       program.provider.wallet.publicKey
//     );

//     await requestPythAirdrop(
//       owner,
//       pythMintAccount.publicKey,
//       pythMintAuthority,
//       200,
//       program.provider.connection
//     );

//     await initConfig(program, pythMintAccount.publicKey);

//     const connection = new Connection(
//       `http://localhost:${portNumber}`,
//       anchor.Provider.defaultOptions().commitment
//     );

//     stakeConnection = await StakeConnection.createStakeConnection(
//       connection,
//       program.provider.wallet,
//       config.programs.localnet.staking
//     );
//   });

//   it("creates vested staking account", async () => {
//     const tx = new Transaction();
//     const ixs: TransactionInstruction[] = [];

//     stakeAccountPositionSecret = await stakeConnection.withCreateAccount(
//       ixs,
//       owner
//     );

//     tx.add(...ixs);
//     await program.provider.send(tx, [stakeAccountPositionSecret], {
//       skipPreflight: DEBUG,
//     });

//     const [metadataAccount, metadataBump] = await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(STAKE_ACCOUNT_METADATA_SEED),
//         stakeAccountPositionSecret.publicKey.toBuffer(),
//       ],
//       program.programId
//     );

//     const [custodyAccount, custodyBump] = await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(CUSTODY_SEED),
//         stakeAccountPositionSecret.publicKey.toBuffer(),
//       ],
//       program.programId
//     );

//     const [authorityAccount, authorityBump] =
//       await PublicKey.findProgramAddress(
//         [
//           anchor.utils.bytes.utf8.encode(AUTHORITY_SEED),
//           stakeAccountPositionSecret.publicKey.toBuffer(),
//         ],
//         program.programId
//       );

//     const [voterAccount, voterBump] = await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(VOTER_SEED),
//         stakeAccountPositionSecret.publicKey.toBuffer(),
//       ],
//       program.programId
//     );

//     const stake_account_metadata_data =
//       await program.account.stakeAccountMetadata.fetch(metadataAccount);

//     assert.equal(
//       JSON.stringify(stake_account_metadata_data),
//       JSON.stringify({
//         metadataBump,
//         custodyBump,
//         authorityBump,
//         voterBump,
//         owner,
//         lock: { fullyVested: {} },
//       })
//     );
//   });

//   it("deposits tokens", async () => {
//     const tx = new Transaction();
//     const ixs: TransactionInstruction[] = [];

//     await stakeConnection.withDepositTokens(
//       ixs,
//       stakeAccountPositionSecret.publicKey,
//       101
//     );

//     tx.add(...ixs);
//     await program.provider.send(tx, [], {
//       skipPreflight: DEBUG,
//     });


//     const to_account = (
//       await PublicKey.findProgramAddress(
//         [
//           anchor.utils.bytes.utf8.encode("custody"),
//           stakeAccountPositionSecret.publicKey.toBuffer(),
//         ],
//         program.programId
//       )
//     )[0];

//     const mint = new Token(
//       program.provider.connection,
//       pythMintAccount.publicKey,
//       TOKEN_PROGRAM_ID,
//       new Keypair()
//     );

//     assert.equal(
//       (await mint.getAccountInfo(to_account)).amount.toNumber(),
//       101
//     );

//     assert.equal((await mint.getAccountInfo(owner_ata)).amount.toNumber(), 99);
//   });

//   it("validates position", async () => {
//     const inbuf = await program.provider.connection.getAccountInfo(
//       stakeAccountPositionSecret.publicKey
//     );
//     const outbuffer = Buffer.alloc(10 * 1024);
//     wasm.convert_positions_account(inbuf.data, outbuffer);
//     const positions = program.coder.accounts.decode("PositionData", outbuffer);

//     for (let index = 0; index < positions.positions.length; index++) {
//       assert.equal(positions.positions[index], null);
//     }
//   });

//   it("withdraws full amount", async () => {
//     await program.methods
//       .withdrawStake(new BN(101))
//       .accounts({
//         stakeAccountPositions: stakeAccountPositionSecret.publicKey,
//         destination: owner_ata,
//       })
//       .rpc();

//     const custody_account = (
//       await PublicKey.findProgramAddress(
//         [
//           anchor.utils.bytes.utf8.encode("custody"),
//           stakeAccountPositionSecret.publicKey.toBuffer(),
//         ],
//         program.programId
//       )
//     )[0];

//     const mint = new Token(
//       program.provider.connection,
//       pythMintAccount.publicKey,
//       TOKEN_PROGRAM_ID,
//       new Keypair()
//     );

//     assert.equal(
//       (await mint.getAccountInfo(custody_account)).amount.toNumber(),
//       0
//     );

//     assert.equal((await mint.getAccountInfo(owner_ata)).amount.toNumber(), 200);
//   });
// });
