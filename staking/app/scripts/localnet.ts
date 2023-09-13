import fs from "fs";
import toml from "toml";
import { PublicKey, Connection } from "@solana/web3.js";
import { exec } from "child_process";
import shell from "shelljs";
import { loadKeypair } from "../../tests/utils/keys";

async function main() {
  const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

  const ledgerDir = config.validator.ledger_dir;
  const walletPubkeyPath = config.provider.wallet;
  const programAddress = new PublicKey(config.programs.localnet.staking);

  shell.exec("anchor build");

  const walletPubkey = loadKeypair(walletPubkeyPath).publicKey;

  shell.exec(`mkdir -p ${ledgerDir}`);

  exec(
    `solana-test-validator --ledger ${ledgerDir} --mint ${walletPubkey} --reset --bpf-program  ${programAddress} ./target/deploy/staking.so`
  );

  //wait until validator is responsive
  const connection = new Connection("http://localhost:8899");
  while (true) {
    try {
      console.log("waiting for validator");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await connection.getEpochInfo();
      break;
    } catch (e) {}
  }

  shell.exec(
    `anchor idl init --filepath target/idl/staking.json ${programAddress}`
  );
}

main();
