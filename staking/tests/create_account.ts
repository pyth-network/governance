// import * as anchor from "@project-serum/anchor";
// import { Program } from "@project-serum/anchor";
// import { Staking } from "../target/types/staking";
// import { depositTokensInstruction, createStakeAccount } from "./utils/utils";

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

// import assert from "assert";
// import fs from "fs";

// const DEBUG = true;

// describe("create_stake_account", async () => {
//   let program: Program<Staking>;

//   let config_account: PublicKey;
//   let bump: number;

//   let errMap: Map<number, string>;

//   const CONFIG_SEED = "config";
//   const STAKE_ACCOUNT_METADATA_SEED = "stake_metadata";
//   const CUSTODY_SEED = "custody";
//   const AUTHORITY_SEED = "authority";
//   const VOTER_SEED = "voter_weight";

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
//       new Uint8Array(
//         JSON.parse(fs.readFileSync("./tests/pyth_mint_account.json").toString())
//       )
//     );

//     pyth_mint_authority = Keypair.fromSecretKey(
//       new Uint8Array(
//         JSON.parse(
//           fs.readFileSync("./tests/pyth_mint_authority.json").toString()
//         )
//       )
//     );

//     user_ata = await Token.getAssociatedTokenAddress(
//       ASSOCIATED_TOKEN_PROGRAM_ID,
//       TOKEN_PROGRAM_ID,
//       pyth_mint_account.publicKey,
//       program.provider.wallet.publicKey
//     );

//     errMap = anchor.parseIdlErrors(program.idl);
//   });

//   it("creates vested staking account", async () => {
//     const owner = program.provider.wallet.publicKey;

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

//     await createStakeAccount(
//       program,
//       stake_account_positions_secret,
//       pyth_mint_account.publicKey
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
//     const transaction = new Transaction();
//     const ix = await depositTokensInstruction(
//       program,
//       stake_account_positions_secret.publicKey,
//       pyth_mint_account.publicKey,
//       101
//     );
//     transaction.add(ix);
//     const tx = await program.provider.send(transaction, [], {
//       skipPreflight: DEBUG,
//     });

//     const to_account = (
//       await PublicKey.findProgramAddress(
//         [
//           anchor.utils.bytes.utf8.encode("custody"),
//           stake_account_positions_secret.publicKey.toBuffer(),
//         ],
//         program.programId
//       )
//     )[0];

//     const mint = new Token(
//       program.provider.connection,
//       pyth_mint_account.publicKey,
//       TOKEN_PROGRAM_ID,
//       new Keypair()
//     );

//     assert.equal(
//       (await mint.getAccountInfo(to_account)).amount.toNumber(),
//       101
//     );
//   });
// });

