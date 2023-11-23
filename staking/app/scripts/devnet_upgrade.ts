import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Program, utils } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { DEVNET_ENDPOINT, STAKING_ADDRESS } from "../constants";
import {
  ANCHOR_CONFIG_PATH,
  CustomAbortController,
  readAnchorConfig,
  startValidatorRaw,
} from "../../tests/utils/before";
import { Staking } from "../../target/types/staking";
import { assert } from "node:console";
import * as wasm from "../../wasm";
import { idlAddress } from "@coral-xyz/anchor/dist/cjs/idl";
import shell from "shelljs";
import { StakeConnection } from "../StakeConnection";
import { loadKeypair } from "../../tests/utils/keys";

const DRY_RUN = true;
const UPGRADE_AUTH_KEYPAIR_PATH =
  "/Users/philip/.config/solana/pyth_devnet_upgrade_auth.json";

interface ToPairAccountInterface {
  publicKey: PublicKey;
  account: {
    owner: PublicKey;
  };
}
// Matches each metadata account to the position account that it corresponds to. This is optimized to avoid RPC calls
// and reduce the number of findProgramAddress calls.
// Assumes each metadata account maps to one position account but there might be position accounts without a metadata
// account (if they've already been upgraded). If this assumption is not true, you can rewite this to use only the
// second pass.
async function pairAccounts<
  P extends ToPairAccountInterface,
  M extends ToPairAccountInterface
>(positionAccounts: P[], metadataAccounts: M[], programId: PublicKey) {
  // First pass: Among owners with only one account, pair them
  let paired: {
    position: P;
    metadata: M;
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

  function groupByOwner<T extends ToPairAccountInterface>(list: T[]) {
    // JS map doesn't use the right equality for a Pubkey, so the keys are strings
    let grouped: Map<string, T[]> = new Map();
    list.forEach((elem) => {
      if (grouped.has(elem.account.owner.toBase58()))
        grouped.get(elem.account.owner.toBase58()).push(elem);
      else grouped.set(elem.account.owner.toBase58(), [elem]);
    });
    return grouped;
  }
}

async function getBPFUpgradeableUtilAccounts(
  connection: Connection,
  program: PublicKey
) {
  const programInfo = await connection.getAccountInfo(program);
  const programDataPubkey = new PublicKey(programInfo.data.slice(4)); // skip the 4 byte account type
  const programData = await connection.getAccountInfo(programDataPubkey);
  // Skip the u32 account type, the u64 slot
  assert(
    programData.data[4 + 8] == 1,
    "Program doesn't have an upgrade authority"
  );
  const upgradeAuth = new PublicKey(
    programData.data.slice(4 + 8 + 1, 4 + 8 + 1 + 32)
  );
  return { programData: programDataPubkey, upgradeAuthority: upgradeAuth };
}

async function launchClonedValidator(
  sourceConnection: Connection,
  program: PublicKey
): Promise<{ controller: CustomAbortController; connection: Connection }> {
  // Clone all of the staking program from devnet into localnet
  const { programData, upgradeAuthority } = await getBPFUpgradeableUtilAccounts(
    sourceConnection,
    program
  );

  const toClone: string[] = [];
  toClone.push(program.toBase58());
  toClone.push(programData.toBase58());
  toClone.push(upgradeAuthority.toBase58()); // Upgrade authority
  toClone.push((await idlAddress(program)).toBase58());

  const allAccts = await sourceConnection.getProgramAccounts(program);
  allAccts.forEach((v) => toClone.push(v.pubkey.toBase58()));
  console.log("Cloning %d accounts", toClone.length);
  // Skipping custody token accounts
  let command = "-u d ";
  for (const pubkey of toClone) {
    command += " -c " + pubkey;
  }
  return await startValidatorRaw(8899, command);
}

async function main() {
  const devnet = new Connection(DEVNET_ENDPOINT);
  const upgradeAuth = loadKeypair(UPGRADE_AUTH_KEYPAIR_PATH);

  const bpfAccounts = await getBPFUpgradeableUtilAccounts(
    devnet,
    STAKING_ADDRESS
  );

  assert(upgradeAuth.publicKey.equals(bpfAccounts.upgradeAuthority));

  let connection: Connection;
  let controller: CustomAbortController;
  if (DRY_RUN) {
    ({ controller, connection } = await launchClonedValidator(
      devnet,
      STAKING_ADDRESS
    ));
    console.log("Localnet is running");
  } else {
    connection = devnet;
    controller = { abort: function () {}, abortController: null };
  }

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);

  await upgradeProgram(
    connection,
    config.path.binary_path,
    config.path.idl_path
  );

  await upgradeAccounts(connection);
}

async function upgradeProgram(
  connection: Connection,
  soPath: string,
  idlPath: string
) {
  // The web3.js functions for interacting with the upgradeable loader are extremely primitive
  console.log("Upgrading program at %s", connection.rpcEndpoint);
  const grepResults = shell.exec(`grep -q MOCK_CLOCK_ENABLED ${soPath}`);
  const GREP_SUCCESS = 0;
  if (grepResults.code == GREP_SUCCESS) {
    console.error("Grep found MOCK_CLOCK_ENABLED in the binary. Aborting.");
    throw new Error("Refusing to deploy binary with mock clock enabled");
  }
  shell.exec(
    `solana program deploy ${soPath} --program-id ${STAKING_ADDRESS.toBase58()} -u ${
      connection.rpcEndpoint
    } --upgrade-authority ${UPGRADE_AUTH_KEYPAIR_PATH}`
  );
  console.log("Upgraded program");
  const idlAddressKey = await idlAddress(STAKING_ADDRESS);
  const idlFinished = new Promise((resolve) => {
    connection.onAccountChange(idlAddressKey, resolve, "finalized");
  });
  let idlResult = shell.exec(
    `anchor idl upgrade --provider.cluster ${
      connection.rpcEndpoint
    } --provider.wallet ${UPGRADE_AUTH_KEYPAIR_PATH} --filepath ${idlPath}  ${STAKING_ADDRESS.toBase58()}`
  );
  console.log("Waiting for IDL: %s", idlResult);
  await idlFinished;
  console.log("IDL updated");
}

async function upgradeAccounts(connection: anchor.web3.Connection) {
  const feePayer = Keypair.generate();
  const airDropSignature = await connection.requestAirdrop(
    feePayer.publicKey,
    LAMPORTS_PER_SOL
  );
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(feePayer),
    {}
  );
  let idl = await Program.fetchIdl(STAKING_ADDRESS, provider)!;

  const program = new Program(
    idl,
    STAKING_ADDRESS,
    provider
  ) as unknown as Program<Staking>;
  console.log("Downloading accounts");
  // Position Data can't be loaded via Anchor
  const allPositionAccounts: ToPairAccountInterface[] = (
    await connection.getProgramAccounts(STAKING_ADDRESS, {
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
  const pairs = await pairAccounts(allPositionAccounts, allV1, STAKING_ADDRESS);
  await connection.confirmTransaction(airDropSignature);
  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    new anchor.Wallet(feePayer),
    STAKING_ADDRESS
  );

  console.log("%d accounts found in need of upgrade", allV1.length);
  // Upgrade one of our accounts first to make sure everything is working
  const testAccount = pairs.find(
    (pos) =>
      pos.position.account.owner.toBase58() ==
      "phiL6zrF5aGxB3KMyYaRiMV8vaABqwrbuv1ahoeBcPc"
  );
  if (testAccount) {
    await upgrade(testAccount, program, feePayer, stakeConnection);
  } else {
    console.log("Specified test account not found");
  }

  for (const elt of pairs) {
    if (elt.position.publicKey.equals(testAccount.position.publicKey)) {
      console.log("Skipping %s", elt.position.publicKey.toBase58());
    } else {
      await upgrade(elt, program, feePayer, stakeConnection);
    }
  }
}

async function upgrade(
  account: {
    position: ToPairAccountInterface;
    metadata: ToPairAccountInterface;
  },
  program: anchor.Program<Staking>,
  feePayer: anchor.web3.Keypair,
  stakeConnection: StakeConnection
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

  // Load the newly upgraded account
  const stakeAccount = await stakeConnection.loadStakeAccount(
    account.position.publicKey
  );
  stakeAccount.getBalanceSummary(await stakeConnection.getTime());
  const nextIndex = stakeAccount.stakeAccountMetadata.nextIndex;
  if (nextIndex > 0)
    assert(
      stakeAccount.stakeAccountPositionsJs.positions[nextIndex - 1] != null
    );
  assert(stakeAccount.stakeAccountPositionsJs.positions[nextIndex] == null);

  console.log("Success. %d positions", nextIndex);
}

main();
