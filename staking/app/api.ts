import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { utils, Provider, Program, Wallet, Idl} from "@project-serum/anchor";
import fs from "fs";
import { StakeConnection} from "../../staking-ts"

const staking_program = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);
export async function getUserStakePositionAccounts(
  program: Program<Idl>,
  provider: Provider,
  user: PublicKey
) {
  const discriminator = Buffer.from(
    utils.sha256.hash(`account:stakeAccountPositions`)
  ).slice(0, 8);

  const res = await provider.connection.getProgramAccounts(program.programId, {
    encoding: 'base64',
    filters: [
      // {
      //   memcmp: {
      //     offset: 0,
      //     bytes: bs58.encode(discriminator),
      //   },
      // },
      {
        memcmp: {
          offset: 8,
          bytes: user.toBase58(),
        },
      },
    ],
  })

  return res
}

async function main() {
  const alice = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(fs.readFileSync("./app/keypairs/alice.json").toString())
    )
  );
  console.log(alice.publicKey);

  const connection: Connection = new Connection("http://localhost:8899");
  const provider = new Provider(connection, new Wallet(alice), {
    preflightCommitment: "recent",
  });
  const idl = await Program.fetchIdl(staking_program, provider);
  const program = new Program(idl, staking_program, provider);

  const stake_account_connection = new StakeConnection(provider, program);

  // const res = await getUserStakePositionAccounts(program, provider, alice.publicKey)
  // console.log(res);
}

main();
//   const program = new anchor.Program(idl, CANDY_MACHINE_PROGRAM_ID, provider);
