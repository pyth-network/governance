import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { Provider, Program, Wallet } from "@project-serum/anchor";
import fs from "fs";
import { StakeConnection, StakeAccount} from "../src"

const staking_program = new PublicKey(
    "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
  );

async function main() {

    const alice = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync("../staking/app/keypairs/alice.json").toString())
    )
  );

  const connection: Connection = new Connection("http://localhost:8899");

  const provider = new Provider(connection, new Wallet(alice), {
    preflightCommitment: "recent",
  });


  const stake_connection : StakeConnection = await StakeConnection.createStakeConnection(connection, new Wallet(alice), staking_program);

  const res = await stake_connection.getStakeAccounts(alice.publicKey);



  console.log(res);



//   console.log(stake_account_connection.config);

  
//   const new_stake = await stake_account_connection.createStakeAccount();
//   console.log(new_stake);

}

main();
//   const program = new anchor.Program(idl, CANDY_MACHINE_PROGRAM_ID, provider);