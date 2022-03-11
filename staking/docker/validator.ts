import fs from "fs";
import toml from 'toml';
import {PublicKey, Keypair } from "@solana/web3.js";
import { exec } from "child_process";
import shell from "shelljs"

const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

const ledger_dir = config.validator.ledger_dir
const wallet_pubkey_path = config.provider.wallet;
const program_address = new PublicKey(config.programs.localnet.staking);


shell.exec(`solana-keygen new -o ${wallet_pubkey_path} --no-bip39-passphrase --force`)
shell.exec("anchor build")

const wallet_pubkey = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync(wallet_pubkey_path).toString())
    )
  ).publicKey

shell.exec(`mkdir -p ${ledger_dir}`)
exec(`solana-test-validator --ledger ${ledger_dir} --mint ${wallet_pubkey} --reset --bpf-program  ${program_address} ./target/deploy/staking.so`)
// we sleep 3 because the validator running in the background needs to get started before we upload the blockchain idl
shell.exec(`sleep 3 && anchor idl init --filepath target/idl/staking.json ${program_address}`)