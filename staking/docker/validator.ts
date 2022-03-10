
import fs from "fs";
import toml from 'toml';
import {PublicKey, Keypair } from "@solana/web3.js";
import { exec } from "child_process";

const config = toml.parse(fs.readFileSync("./Anchor.toml").toString());

const testing_dir = "./.anchor/test-ledger"
const wallet_pubkey_path = config.provider.wallet;

const program_address = new PublicKey(config.programs.localnet.staking);

exec(`solana-keygen new -o ${wallet_pubkey_path} --no-bip39-passphrase --force`)

const wallet_pubkey = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync("../staking/app/keypairs/alice.json").toString())
    )
  ).publicKey

exec(`mkdir -p ${testing_dir}`)
exec(`solana-test-validator --ledger ${testing_dir} --mint ${wallet_pubkey} --reset --bpf-program  ${program_address} ./target/deploy/staking.so &`)
exec("sleep 3");
exec(`anchor idl init --filepath target/idl/staking.json ${program_address}`)
exec("fg")