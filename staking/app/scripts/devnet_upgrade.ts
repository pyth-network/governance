import * as anchor from "@project-serum/anchor";
import { AnchorProvider, Program, utils } from "@project-serum/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { DEVNET_STAKING_ADDRESS } from "../constants";
import { Staking } from "../../target/types/staking";
import * as readline from "node:readline";
import { assert } from "node:console";
import * as wasm from "../../wasm";

interface ToPairAccountInterface {
  publicKey: PublicKey;
  account: {
    owner: PublicKey;
  };
}
// Assumes each metadata account maps to one position account but there might be position accounts without a metadata account (if they've already been upgraded)
async function pairAccounts(
  positionAccounts: ToPairAccountInterface[],
  metadataAccounts: ToPairAccountInterface[],
  programId: PublicKey
) {
  // First pass: Among owners with only one account, pair them
  let paired: {
    position: ToPairAccountInterface;
    metadata: ToPairAccountInterface;
  }[] = [];
  let positionByOwner = groupByOwner(positionAccounts);
  let metadataByOwner = groupByOwner(metadataAccounts);
  let multiOwners: string[] = []; // Owners with multiple accounts
  positionByOwner.forEach((accounts, ownerPubkey) => {
    if (accounts.length == 1) {
      if (metadataByOwner.has(ownerPubkey)) {
        let metadata = metadataByOwner.get(ownerPubkey);
        // If there's only one positionAccount, there better be at most one metadata account
        assert(metadata.length == 1);
        paired.push({ position: accounts[0], metadata: metadata[0] });
      } /* else the metadata account has already been taken care of */
    } else {
      multiOwners.push(ownerPubkey);
    }
  });

  // Second pass: Use the PDA derivation rules to match the remaining accounts
  for (const owner of multiOwners) {
    for (const posAcct of positionByOwner.get(owner)) {
      const metadataAddress = (
        await PublicKey.findProgramAddress(
          [
            utils.bytes.utf8.encode(
              wasm.Constants.STAKE_ACCOUNT_METADATA_SEED()
            ),
            posAcct.publicKey.toBuffer(),
          ],
          programId
        )
      )[0];
      const metadataAccount = metadataByOwner
        .get(owner)
        .find((m) => m.publicKey.equals(metadataAddress));
      if (metadataAccount) {
        paired.push({ position: posAcct, metadata: metadataAccount });
      }
    }
  }
  assert(paired.length == metadataAccounts.length);
  return paired;

  function groupByOwner(list: ToPairAccountInterface[]) {
    // JS map doesn't use the right equality for a Pubkey, so the keys are strings
    let grouped: Map<string, ToPairAccountInterface[]> = new Map();
    list.forEach((elem) => {
      if (grouped.has(elem.publicKey.toBase58()))
        grouped.get(elem.publicKey.toBase58()).push(elem);
      else grouped.set(elem.publicKey.toBase58(), [elem]);
    });
    return grouped;
  }
}

async function main() {
  const connection = new Connection("https://api.devnet.solana.com");
  const feePayer = Keypair.generate();
  await connection.requestAirdrop(feePayer.publicKey, LAMPORTS_PER_SOL);
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(feePayer),
    {}
  );
  const idl = (await Program.fetchIdl(DEVNET_STAKING_ADDRESS, provider))!;

  const program = new Program(
    idl,
    DEVNET_STAKING_ADDRESS,
    provider
  ) as unknown as Program<Staking>;
  const allPositionAccounts = await program.account.positionData.all();
  const allV1 = await program.account.stakeAccountMetadata.all();
  const pairs = await pairAccounts(
    allPositionAccounts,
    allV1,
    DEVNET_STAKING_ADDRESS
  );
  console.log("%d accounts found in need of upgrade", allV1.length);
  // Upgrade one of our accounts first to make sure everything is working
  const testAccount = pairs.find(
    (pos) =>
      pos.position.account.owner.toBase58() ==
      "phiL6zrF5aGxB3KMyYaRiMV8vaABqwrbuv1ahoeBcPc"
  );
  if (testAccount) {
    await upgrade(testAccount, program, feePayer);
  } else {
    console.log("Specified test account not found");
  }
  const rl = readline.createInterface(process.stdin, process.stdout);
  rl.question(
    "Type Y to continue and upgrade all other accounts",
    async (ans) => {
      if (ans.toLowerCase() == "y") {
        for (const elt of pairs) {
          if (elt.position.publicKey.equals(testAccount.position.publicKey)) {
            console.log("Skipping %s", elt.position.publicKey.toBase58());
          }
          await upgrade(elt, program, feePayer);
        }
      }
    }
  );
}

async function upgrade(
  account: {
    position: ToPairAccountInterface;
    metadata: ToPairAccountInterface;
  },
  program: anchor.Program<Staking>,
  feePayer: anchor.web3.Keypair
) {
  console.log(
    "Upgrading %s owned by %s",
    account.position.publicKey.toBase58(),
    account.position.account.owner.toBase58()
  );
  console.log(
    await program.methods
      .upgradeStakeAccountMetadata()
      .accounts({
        payer: feePayer,
        stakeAccountPositions: account.position.publicKey,
      })
      .remainingAccounts([
        {
          pubkey: account.metadata.publicKey,
          isWritable: true,
          isSigner: false,
        },
      ])
      .rpc()
  );
}

main();
