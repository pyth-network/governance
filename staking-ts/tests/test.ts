import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { Provider, Wallet } from "@project-serum/anchor";
import fs from "fs";
import { StakeConnection} from "../src"

// let's try to get rid of this magic constant
const staking_program = new PublicKey(
    "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
  );

describe("api", async () => {

  it("parses accounts", async () => {

    const alice = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(fs.readFileSync("../staking/app/keypairs/alice.json").toString())
      )
    );
  
    const connection: Connection = new Connection("http://localhost:8899");
  
    const stake_connection : StakeConnection = await StakeConnection.createStakeConnection(connection, new Wallet(alice), staking_program);
  
    const res = await stake_connection.getStakeAccounts(alice.publicKey);
  });
});