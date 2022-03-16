import fs from "fs";
import toml from "toml";
import { PublicKey, Keypair, Connection } from "@solana/web3.js";
import { exec } from "child_process";
import shell from "shelljs";
import yargs from "yargs";

const LOCALNET_URL = "http://localhost:8899";

async function main() {
  const argv = yargs(process.argv.slice(2)).options({
    detach: { type: "boolean", default: false, alias: "d" },
    command: {
      type: "string",
      default:
        'echo "You can use --command to run a command right after the validator gets deployed"',
      alias: "c",
    },
    mock_clock: { type: "boolean", default: false },
  }).argv;

  const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

  const ledger_dir = config.validator.ledger_dir;
  const wallet_pubkey_path = config.provider.wallet;

  const program_address = new PublicKey(config.programs.localnet.staking);

  shell.exec(
    `solana-keygen new -o ${wallet_pubkey_path} --no-bip39-passphrase --force`
  );
  shell.exec(
    `anchor build ${argv.mock_clock ? "-- --features mock-clock" : ""}`
  );

  shell.env["ANCHOR_WALLET"] = wallet_pubkey_path;
  shell.env["ANCHOR_PROVIDER_URL"] = LOCALNET_URL;

  const wallet_pubkey = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(wallet_pubkey_path).toString()))
  ).publicKey;

  shell.exec(`mkdir -p ${ledger_dir}`);

  const controller = new AbortController();
  const { signal } = controller;

  exec(
    `solana-test-validator --ledger ${ledger_dir} --mint ${wallet_pubkey} --reset --bpf-program  ${program_address} ./target/deploy/staking.so`,
    { signal }
  );

  //wait until validator is responsive
  const connection = new Connection(LOCALNET_URL);
  while (true) {
    try {
      console.log("waiting for validator");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await connection.getEpochInfo();
      break;
    } catch (e) {}
  }

  shell.exec(
    `anchor idl init --filepath target/idl/staking.json ${program_address}`
  );

  if (shell.exec(argv.command).code !== 0) {
    if (!argv.detach) {
      controller.abort();
      throw Error("Failed tests");
    }
    
  }
  if (!argv.detach) {
    controller.abort();
  } else {
    console.log("This validator will keep running until killed");
  }
}

main();
