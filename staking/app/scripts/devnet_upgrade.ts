import * as anchor from "@project-serum/anchor";
import { AnchorProvider, Program, utils } from "@project-serum/anchor";
import {
  BpfLoader,
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
import { idlAddress } from "@project-serum/anchor/dist/cjs/idl";
import { exec } from "child_process";
import shell from "shelljs";

import fs from "fs";

const DRY_RUN = true;
const UPGRADE_AUTH_KEYPAIR_PATH =
  "/Users/philip/.config/solana/pyth_devnet_upgrade_auth.json";
const NEW_BINARY_PATH =
  "/Users/philip/pyth-gov/staking/target/deploy/staking.so";
const NEW_IDL_PATH = "/Users/philip/pyth-gov/staking/target/idl/staking.json";
const UPGRADE_AUTHORITY = "upg8KLALUN7ByDHiBu4wEbMDTC6UnSVFSYfTyGfXuzr";

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
      if (grouped.has(elem.account.owner.toBase58()))
        grouped.get(elem.account.owner.toBase58()).push(elem);
      else grouped.set(elem.account.owner.toBase58(), [elem]);
    });
    return grouped;
  }
}

async function prepare(dryRun): Promise<Connection> {
  const devnetConnection = new Connection("https://api.devnet.solana.com");
  if (!dryRun) return devnetConnection;
  // Clone all of the staking program from devnet into localnet
  const toClone: string[] = [];
  toClone.push(DEVNET_STAKING_ADDRESS.toBase58());
  toClone.push("44pm2sLV2xC7pjEk2UxUR3hPPFDbLSykAcPoU9YKrwJe"); // The executable data address is a pain to get programatically
  toClone.push(UPGRADE_AUTHORITY); // Upgrade authority
  toClone.push((await idlAddress(DEVNET_STAKING_ADDRESS)).toBase58());

  const devnetProvider = new AnchorProvider(
    devnetConnection,
    new anchor.Wallet(Keypair.generate()), // We don't submit any transactions, only RPC
    {}
  );
  const devnetIdl = (await Program.fetchIdl(
    DEVNET_STAKING_ADDRESS,
    devnetProvider
  ))!;

  const devnetProgram = new Program(
    devnetIdl,
    DEVNET_STAKING_ADDRESS,
    devnetProvider
  ) as unknown as Program<Staking>;
  const allAccts = await devnetConnection.getProgramAccounts(
    DEVNET_STAKING_ADDRESS
  );
  allAccts.forEach((v) => toClone.push(v.pubkey.toBase58()));
  console.log("Cloning %d accounts", toClone.length);
  // Skipping custody token accounts
  let command = "solana-test-validator --reset -u d ";
  for (const pubkey of toClone) {
    command += " -c " + pubkey;
  }
  const internalController: AbortController = new AbortController();
  const { signal } = internalController;
  exec(command, { signal }, (error, stdout, stderr) => {
    if (error.name.includes("AbortError")) {
      // Test complete, this is expected.
      return;
    }
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });
  const connection = new Connection("http://localhost:8899");

  while (true) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await connection.getEpochInfo();
      break;
    } catch (e) {}
  }
  console.log("Localnet is running");
  return connection;
}

async function main() {
  const upgradeAuth = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(UPGRADE_AUTH_KEYPAIR_PATH).toString())
    )
  );
  assert(upgradeAuth.publicKey.toBase58() == UPGRADE_AUTHORITY);

  const connection = await prepare(DRY_RUN);
  await upgradeProgram(connection, NEW_BINARY_PATH, NEW_IDL_PATH);

  await upgradeAccounts(connection);
}

async function upgradeProgram(
  connection: Connection,
  soPath: string,
  idlPath: string
) {
  // The web3.js functions for interacting with the upgradeable loader are extremely primitive
  console.log("Upgrading program at %s", connection.rpcEndpoint);
  shell.exec(
    `solana program deploy ${soPath} --program-id ${DEVNET_STAKING_ADDRESS.toBase58()} -u ${
      connection.rpcEndpoint
    } --upgrade-authority ${UPGRADE_AUTH_KEYPAIR_PATH}`
  );
  console.log("Upgraded program");

  let idlResult = shell.exec(
    `anchor idl upgrade --provider.cluster ${
      connection.rpcEndpoint
    } --provider.wallet ${UPGRADE_AUTH_KEYPAIR_PATH} --filepath ${idlPath}  ${DEVNET_STAKING_ADDRESS.toBase58()}`
  );
  console.log("Upgraded IDL: %s", idlResult);
}

async function upgradeAccounts(connection: anchor.web3.Connection) {
  const feePayer = Keypair.generate();
  await connection.requestAirdrop(feePayer.publicKey, LAMPORTS_PER_SOL);
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(feePayer),
    {}
  );
  let idl: anchor.Idl;
  while (true) {
    idl = await Program.fetchIdl(DEVNET_STAKING_ADDRESS, provider)!;
    // HACK: wait for IDL to be upgraded
    if (idl.instructions.length > 10) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const program = new Program(
    idl,
    DEVNET_STAKING_ADDRESS,
    provider
  ) as unknown as Program<Staking>;
  console.log("Downloading accounts");
  // Position Data can't be loaded via Anchor
  const allPositionAccounts: ToPairAccountInterface[] = (
    await connection.getProgramAccounts(DEVNET_STAKING_ADDRESS, {
      filters: [{ memcmp: program.coder.accounts.memcmp("positionData") }],
    })
  ).map((e) => {
    return {
      publicKey: e.pubkey,
      account: { owner: new PublicKey(e.account.data.subarray(8, 32 + 8)) },
    };
  });
  const allV1 = await program.account.stakeAccountMetadata.all();
  console.log("Accounts downloaded");
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

  for (const elt of pairs) {
    if (elt.position.publicKey.equals(testAccount.position.publicKey)) {
      console.log("Skipping %s", elt.position.publicKey.toBase58());
    } else {
      await upgrade(elt, program, feePayer);
    }
  }
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
        payer: feePayer.publicKey,
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
