import { Provider, Wallet, Program } from "@project-serum/anchor";
import BN from "bn.js";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  readAnchorConfig,
  standardSetup,
  ANCHOR_CONFIG_PATH,
  requestPythAirdrop,
} from "../../tests/utils/before";
import {
  TOKEN_PROGRAM_ID,
  Token,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createMint, initConfig } from "../../tests/utils/before";
import { StakeConnection, PythBalance, PYTH_DECIMALS } from "..";
import fs from "fs";
import os from "os";
import shell from "shelljs";

const FRONTEND_ENV_FILE = "../frontend/.env";
const FRONTEND_SAMPLE_FILE = "../frontend/.env.sample";
const LIB_PATH = "programs/staking/src/lib.rs";

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

const setProgramId = (programAddress: PublicKey) => {
  const contents = fs.readFileSync(LIB_PATH, "utf-8");
  fs.writeFileSync(
    LIB_PATH,
    contents.replace(
      new RegExp(/declare_id!\("[A-Za-z0-9]*"\)/),
      `declare_id!("${programAddress.toBase58()}")`
    )
  );
};

const DEVNET_URL = "https://api.devnet.solana.com";
async function main() {
  const connection: Connection = new Connection(
    DEVNET_URL,
    Provider.defaultOptions().commitment
  );

  const pythMintAccount = new Keypair();

  const alice = new Keypair();
  const bob = new Keypair();
  const programAddress = new Keypair();

  shell.exec("yarn generate_keypair");

  fs.writeFileSync(
    `./app/keypairs/alice.json`,
    `[${alice.secretKey.toString()}]`
  );
  fs.writeFileSync(`./app/keypairs/bob.json`, `[${bob.secretKey.toString()}]`);
  fs.writeFileSync(
    `./app/keypairs/program.json`,
    `[${programAddress.secretKey.toString()}]`
  );

  fs.writeFileSync(
    `./app/keypairs/pyth_mint.json`,
    JSON.stringify(pythMintAccount.publicKey.toBase58())
  );

  const config = readAnchorConfig(ANCHOR_CONFIG_PATH);
  const walletSecretPath = config.provider.wallet;
  const idlPath = config.path.idl_path;

  setProgramId(programAddress.publicKey);

  shell.exec(`solana config set --keypair ${walletSecretPath}`);
  shell.exec("anchor build");

  const user = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletSecretPath).toString()))
  );

  fs.writeFileSync(
    `./app/keypairs/pyth_authority.json`,
    `[${user.secretKey.toString()}]`
  );

  for (let i = 0; i < 5; i++) {
    shell.exec(`solana airdrop 2 -u ${DEVNET_URL}`);
  }

  console.log(
    `solana program deploy /Users/gbescos/Documents/repos/pyth-staking/staking/target/deploy/staking.so --url ${DEVNET_URL}  --program-id ${"./app/keypairs/program.json"}`
  );
  shell.exec(
    `solana program deploy /Users/gbescos/Documents/repos/pyth-staking/staking/target/deploy/staking.so --url ${DEVNET_URL} --program-id ${"./app/keypairs/program.json"}`
  );
  shell.exec(
    `anchor idl init -f ${idlPath} ${programAddress.publicKey.toBase58()}  --provider.cluster ${DEVNET_URL} --provider.wallet ${walletSecretPath}`
  );

  const provider = new Provider(connection, new Wallet(user), {});
  const program = new Program(
    JSON.parse(fs.readFileSync(idlPath).toString()),
    programAddress.publicKey,
    provider
  );

  await createMint(
    provider,
    pythMintAccount,
    user.publicKey,
    null,
    PYTH_DECIMALS,
    TOKEN_PROGRAM_ID
  );

  await initConfig(program, pythMintAccount.publicKey, {
    bump: 0,
    governanceAuthority: user.publicKey,
    pythGovernanceRealm: new PublicKey(0),
    pythTokenMint: pythMintAccount.publicKey,
    unlockingDuration: 2,
    epochDuration: new BN(1),
    mockClockTime: new BN(10),
  });

  const stakeConnection = await StakeConnection.createStakeConnection(
    connection,
    program.provider.wallet as Wallet,
    programAddress.publicKey,
    new PublicKey(config.programs.devnet.governance)
  );

  for (let owner of [alice.publicKey, bob.publicKey]) {
    //get SOL
    shell.exec(`solana airdrop 2 -u ${DEVNET_URL} ${owner.toBase58()}`);

    //get PYTH
    const destinationAta = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      pythMintAccount.publicKey,
      owner
    );

    shell.exec(
      `spl-token create-account ${pythMintAccount.publicKey.toBase58()} --owner ${owner.toBase58()} -u ${DEVNET_URL} --fee-payer ${walletSecretPath}`
    );
    shell.exec(
      `spl-token mint ${pythMintAccount.publicKey.toBase58()} 1000 ${destinationAta.toBase58()}`
    );
  }

  await new Promise((r) => setTimeout(r, 10000));

  const aliceStakeConnection = await StakeConnection.createStakeConnection(
    stakeConnection.program.provider.connection,
    new Wallet(alice),
    stakeConnection.program.programId,
    new PublicKey(config.programs.devnet.governance)
  );

  const bobStakeConnection = await StakeConnection.createStakeConnection(
    stakeConnection.program.provider.connection,
    new Wallet(bob),
    stakeConnection.program.programId,
    new PublicKey(config.programs.devnet.governance)
  );

  for (let connection of [aliceStakeConnection, bobStakeConnection]) {
    await connection.depositAndLockTokens(
      undefined,
      PythBalance.fromString("500")
    );
  }

  setEnvValue(
    "DEVNET_PYTH_MINT",
    pythMintAccount.publicKey.toBase58(),
    fs.existsSync(FRONTEND_ENV_FILE) ? FRONTEND_ENV_FILE : FRONTEND_SAMPLE_FILE
  );

  setEnvValue(
    "DEVNET_PROGRAM",
    programAddress.publicKey.toBase58(),
    fs.existsSync(FRONTEND_ENV_FILE) ? FRONTEND_ENV_FILE : FRONTEND_SAMPLE_FILE
  );

  setEnvValue(
    "ENDPOINT",
    "devnet",
    fs.existsSync(FRONTEND_ENV_FILE) ? FRONTEND_ENV_FILE : FRONTEND_SAMPLE_FILE
  );
}

main();
