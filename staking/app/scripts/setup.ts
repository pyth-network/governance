import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../../target/types/staking";
import BN from "bn.js";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  readAnchorConfig,
  standardSetup,
  ANCHOR_CONFIG_PATH,
  getPortNumber,
  requestPythAirdrop,
} from "../../tests/utils/before";
import path from "path";
import { StakeConnection, PythBalance } from "..";
import fs from "fs";
import os from "os";

const FRONTEND_ENV_FILE = "../frontend/.env";
const FRONTEND_SAMPLE_FILE = "../frontend/.env.sample";

//https://stackoverflow.com/questions/53360535/how-to-save-changes-in-env-file-in-node-js
const readEnvVars = (path) => fs.readFileSync(path, "utf-8").split(os.EOL);

//https://stackoverflow.com/questions/53360535/how-to-save-changes-in-env-file-in-node-js
const setEnvValue = (key, value, path) => {
  const envVars = readEnvVars(path);
  const targetLine = envVars.find((line) => line.split("=")[0] === key);
  if (targetLine !== undefined) {
    // update existing line
    const targetLineIndex = envVars.indexOf(targetLine);
    // replace the key/value with the new value
    envVars.splice(targetLineIndex, 1, `${key}="${value}"`);
  } else {
    // create new key value
    envVars.push(`${key}=${value}`);
  }
  // write everything back to the file system
  fs.writeFileSync(FRONTEND_ENV_FILE, envVars.join(os.EOL));
};

const portNumber = 8899;
async function main() {
  let stakeConnection: StakeConnection;
  let controller: AbortController;

  const pythMintAccount = new Keypair();
  const pythMintAuthority = new Keypair();

  const alice = new Keypair();
  const bob = new Keypair();

  fs.writeFileSync(
    `./app/keypairs/alice.json`,
    `[${alice.secretKey.toString()}]`
  );
  fs.writeFileSync(`./app/keypairs/bob.json`, `[${bob.secretKey.toString()}]`);
  fs.writeFileSync(
    `./app/keypairs/pyth_mint.json`,
    JSON.stringify(pythMintAccount.publicKey.toBase58())
  );

  console.log("Validator at port ", portNumber);
  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
  ({ controller, stakeConnection } = await standardSetup(
    portNumber,
    config,
    pythMintAccount,
    pythMintAuthority,
    {
      bump: 0,
      governanceAuthority: new PublicKey(0),
      pythGovernanceRealm: new PublicKey(0),
      pythTokenMint: pythMintAccount.publicKey,
      unlockingDuration: 2,
      epochDuration: new BN(1),
      mockClockTime: new BN(10),
    }
  ));

  for (let owner of [alice.publicKey, bob.publicKey]) {
    await stakeConnection.program.provider.connection.requestAirdrop(
      owner,
      1_000_000_000_000
    );
    await requestPythAirdrop(
      owner,
      pythMintAccount.publicKey,
      pythMintAuthority,
      PythBalance.fromString("1000"),
      stakeConnection.program.provider.connection
    );
  }

  const aliceStakeConnection = await StakeConnection.createStakeConnection(
    stakeConnection.program.provider.connection,
    new anchor.Wallet(alice),
    stakeConnection.program.programId
  );

  const bobStakeConnection = await StakeConnection.createStakeConnection(
    stakeConnection.program.provider.connection,
    new anchor.Wallet(bob),
    stakeConnection.program.programId
  );

  for (let connection of [aliceStakeConnection, bobStakeConnection]) {
    await connection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("500")
    );
  }

  setEnvValue(
    "LOCALNET_PYTH_MINT",
    pythMintAccount.publicKey.toBase58(),
    fs.existsSync(FRONTEND_ENV_FILE) ? FRONTEND_ENV_FILE : FRONTEND_SAMPLE_FILE
  );

  while (true) {}
}

main();
