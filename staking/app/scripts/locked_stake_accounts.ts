import { AnchorProvider, IdlAccounts, Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
  getAllMetadataAccounts,
  getConfig,
  getLockSummary,
} from "@pythnetwork/staking/app/api_utils";
import idl from "@pythnetwork/staking/target/idl/staking.json";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import { Staking } from "../../target/types/staking";
import { STAKING_ADDRESS } from "../constants";

const RPC_URL = process.env.ENDPOINT!;
const connection = new Connection(RPC_URL);
const provider = new AnchorProvider(
  connection,
  new NodeWallet(new Keypair()),
  {}
);
const stakingProgram = new Program<Staking>(
  idl as Staking,
  STAKING_ADDRESS,
  provider
);

// The JSON payload is too big when using the @solana/web3.js getProgramAccounts
// We get around this by using the base64+ztsd encoding instead of base64 that @solana/web3.js uses
async function getAllStakeAccounts(
  url: string
): Promise<{ publicKey: PublicKey; data: string }[]> {
  const response = await axios({
    method: "post",
    url: url,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [
        STAKING_ADDRESS,
        {
          encoding: "base64+zstd",
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from("55c3f14f7cc04f0b", "hex")), // Positions account discriminator
              },
            },
          ],
        },
      ],
    },
  });

  return response.data.result.map((x: any) => {
    return { publicKey: x.pubkey, data: x.account.data[0] };
  });
}

async function main() {
  const configAccountData = await getConfig(stakingProgram);
  const stakeAccounts = await getAllStakeAccounts(RPC_URL);
  const stakeAccountPubkeys = stakeAccounts.map(
    (account) => new PublicKey(account.publicKey)
  );
  const allMetadataAccounts = await getAllMetadataAccounts(
    stakingProgram,
    stakeAccountPubkeys
  );

  allMetadataAccounts.forEach(
    (
      account: IdlAccounts<Staking>["stakeAccountMetadataV2"] | null,
      index: number
    ) => {
      if (account === null) {
        return;
      }
      const lock = account.lock;
      const summary = getLockSummary(lock, configAccountData.pythTokenListTime);
      if (summary && summary.type !== "fullyUnlocked") {
        console.log(stakeAccountPubkeys[index].toBase58());
      }
    }
  );
}

main();
