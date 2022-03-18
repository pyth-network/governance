// import * as anchor from "@project-serum/anchor";
// import { Program } from "@project-serum/anchor";
// import { Staking } from "../target/types/staking";
// import { positions_account_size } from "./utils/constant";
// import {
//   TOKEN_PROGRAM_ID,
//   Token,
//   ASSOCIATED_TOKEN_PROGRAM_ID,
// } from "@solana/spl-token";
// import {
//   PublicKey,
//   Keypair,
//   Transaction,
//   SystemProgram,
// } from "@solana/web3.js";
// import {expect_fail } from "./utils/utils";
// import BN from "bn.js";
// import assert from "assert";
// import * as wasm from "../wasm/node/staking";
// import fs from "fs";

// // When DEBUG is turned on, we turn preflight transaction checking off
// // That way failed transactions show up in the explorer, which makes them
// // easier to debug.
// const DEBUG = true;

// describe("staking", async () => {
//   let program: Program<Staking>;

//   let config_account: PublicKey;
//   let voterAccount: PublicKey;
//   let bump: number;
//   let errMap: Map<number, string>;

//   const CONFIG_SEED = "config";
//   const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
//   const CUSTODY_SEED = "custody";
//   const AUTHORITY_SEED = "authority";
//   const VOTER_SEED = "voter_weight";

//   const provider = anchor.Provider.local();

//   const stake_account_positions_secret = new Keypair();

//   let pyth_mint_account;
//   let pyth_mint_authority;
//   const zero_pubkey = new PublicKey(0);

//   let user_ata; 

//   before(async () => {
//     program = anchor.workspace.Staking as Program<Staking>;

//     [config_account, bump] = await PublicKey.findProgramAddress(
//       [anchor.utils.bytes.utf8.encode(CONFIG_SEED)],
//       program.programId
//     );

//     while (true) {
//       try {
//         console.log("waiting");
//         await new Promise((resolve) => setTimeout(resolve, 1000));
//         await program.account.globalConfig.fetch(config_account);
//         break;
//       } catch (e) {}
//     }

//     pyth_mint_account = Keypair.fromSecretKey(
//         new Uint8Array(
//           JSON.parse(fs.readFileSync("./tests/pyth_mint_account.json").toString())
//         )
//       );
    
//       pyth_mint_authority = Keypair.fromSecretKey(
//         new Uint8Array(
//           JSON.parse(fs.readFileSync("./tests/pyth_mint_authority.json").toString())
//         )
//       );

//        user_ata = await Token.getAssociatedTokenAddress(
//         ASSOCIATED_TOKEN_PROGRAM_ID,
//         TOKEN_PROGRAM_ID,
//         pyth_mint_account.publicKey,
//         provider.wallet.publicKey
//       );

//     errMap = anchor.parseIdlErrors(program.idl);
//   });

//   it("creates vested staking account", async () => {
//     const owner = provider.wallet.publicKey;

//     const [metadataAccount, metadataBump] = await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(STAKE_ACCOUNT_METADATA_SEED),
//         stake_account_positions_secret.publicKey.toBuffer(),
//       ],
//       program.programId
//     );

//     const [custodyAccount, custodyBump] = await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(CUSTODY_SEED),
//         stake_account_positions_secret.publicKey.toBuffer(),
//       ],
//       program.programId
//     );

//     const [authorityAccount, authorityBump] =
//       await PublicKey.findProgramAddress(
//         [
//           anchor.utils.bytes.utf8.encode(AUTHORITY_SEED),
//           stake_account_positions_secret.publicKey.toBuffer(),
//         ],
//         program.programId
//       );

//     const [voterAccount, voterBump] = await PublicKey.findProgramAddress(
//       [
//         anchor.utils.bytes.utf8.encode(VOTER_SEED),
//         stake_account_positions_secret.publicKey.toBuffer(),
//       ],
//       program.programId
//     );

//     const tx = await program.methods
//       .createStakeAccount(owner, { fullyVested: {} })
//       .preInstructions([
//         SystemProgram.createAccount({
//           fromPubkey: provider.wallet.publicKey,
//           newAccountPubkey: stake_account_positions_secret.publicKey,
//           lamports: await provider.connection.getMinimumBalanceForRentExemption(
//             positions_account_size
//           ),
//           space: positions_account_size,
//           programId: program.programId,
//         }),
//       ])
//       .accounts({
//         stakeAccountPositions: stake_account_positions_secret.publicKey,
//         mint: pyth_mint_account.publicKey,
//       })
//       .signers([stake_account_positions_secret])
//       .rpc({
//         skipPreflight: DEBUG,
//       });

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
//     const transaction = new Transaction();
//     const from_account = user_ata;

//     const create_ata_ix = Token.createAssociatedTokenAccountInstruction(
//       ASSOCIATED_TOKEN_PROGRAM_ID,
//       TOKEN_PROGRAM_ID,
//       pyth_mint_account.publicKey,
//       from_account,
//       provider.wallet.publicKey,
//       provider.wallet.publicKey
//     );
//     transaction.add(create_ata_ix);

//     // Mint 1000 tokens. We'll send 101 to the custody wallet and save 899 for later.
//     const mint_ix = Token.createMintToInstruction(
//       TOKEN_PROGRAM_ID,
//       pyth_mint_account.publicKey,
//       from_account,
//       pyth_mint_authority.publicKey,
//       [],
//       1000
//     );
//     transaction.add(mint_ix);

//     const to_account = (
//       await PublicKey.findProgramAddress(
//         [
//           anchor.utils.bytes.utf8.encode("custody"),
//           stake_account_positions_secret.publicKey.toBuffer(),
//         ],
//         program.programId
//       )
//     )[0];

//     const ix = Token.createTransferInstruction(
//       TOKEN_PROGRAM_ID,
//       from_account,
//       to_account,
//       provider.wallet.publicKey,
//       [],
//       101
//     );
//     transaction.add(ix);
//     const tx = await provider.send(transaction, [pyth_mint_authority], {
//       skipPreflight: DEBUG,
//     });
//   });

//   it("updates voter weight", async () => {
//     await program.methods
//       .updateVoterWeight()
//       .accounts({
//         stakeAccountPositions: stake_account_positions_secret.publicKey,
//       })
//       .rpc({ skipPreflight: DEBUG });

//     const voter_record = await program.account.voterWeightRecord.fetch(
//       voterAccount
//     );
//     // Haven't locked anything, so no voter weight
//     assert.equal(voter_record.voterWeight.toNumber(), 0);
//   });

//   it("withdraws tokens", async () => {
//     const to_account = user_ata;

//     await program.methods
//       .withdrawStake(new BN(1))
//       .accounts({
//         stakeAccountPositions: stake_account_positions_secret.publicKey,
//         destination: to_account,
//       })
//       .rpc({ skipPreflight: DEBUG });
//   });

//   it("parses positions", async () => {
//     const inbuf = await program.provider.connection.getAccountInfo(
//       stake_account_positions_secret.publicKey
//     );
//     const outbuffer = Buffer.alloc(10 * 1024);
//     wasm.convert_positions_account(inbuf.data, outbuffer);
//     const positions = program.coder.accounts.decode("PositionData", outbuffer);
//     for (let index = 0; index < positions.positions.length; index++) {
//       assert.equal(positions.positions[index], null);
//     }
//   });

//   it("creates a position that's too big", async () => {
//     expect_fail(
//       program.methods
//         .createPosition(zero_pubkey, zero_pubkey, new BN(102))
//         .accounts({
//           stakeAccountPositions: stake_account_positions_secret.publicKey,
//         }),
//       "Insufficient balance to take on a new position",
//       errMap
//     );
//   });

//   it("creates a position", async () => {
//     const tx = await program.methods
//       .createPosition(null, null, new BN(1))
//       .accounts({
//         stakeAccountPositions: stake_account_positions_secret.publicKey,
//       })
//       .rpc({
//         skipPreflight: DEBUG,
//       });
//   });

//   it("validates position", async () => {
//     const inbuf = await program.provider.connection.getAccountInfo(
//       stake_account_positions_secret.publicKey
//     );
//     const outbuffer = Buffer.alloc(10 * 1024);
//     wasm.convert_positions_account(inbuf.data, outbuffer);
//     const positions = program.coder.accounts.decode("PositionData", outbuffer);

//     // TODO: Once we merge the mock clock branch and control the activationEpoch, replace with struct equality
//     assert.equal(
//       positions.positions[0].amount.toNumber(),
//       new BN(1).toNumber()
//     );
//     assert.equal(positions.positions[0].product, null);
//     assert.equal(positions.positions[0].publisher, null);
//     assert.equal(positions.positions[0].unlockingStart, null);
//     for (let index = 1; index < positions.positions.length; index++) {
//       assert.equal(positions.positions[index], null);
//     }
//   });

//   it("updates voter weight again", async () => {
//     await program.methods
//       .advanceClock(new BN(5 * 3600))
//       .accounts()
//       .rpc({ skipPreflight: DEBUG });

//     await program.methods
//       .updateVoterWeight()
//       .accounts({
//         stakeAccountPositions: stake_account_positions_secret.publicKey,
//       })
//       .rpc({ skipPreflight: DEBUG });

//     const voter_record = await program.account.voterWeightRecord.fetch(
//       voterAccount
//     );
//     // Locked in 1 token, so voter weight is 1
//     assert.equal(voter_record.voterWeight.toNumber(), 1);
//   });


// });
