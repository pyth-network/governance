import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { StakeConnection } from "../StakeConnection";
import { PROFILE_ADDRESS, STAKING_ADDRESS } from "../constants";
import axios from "axios";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ZstdInit, ZstdStream } from "@oneidentity/zstd-js";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import {
  ProfileConnection,
  getIdentityAccountAddress,
} from "../ProfileConnection";
import * as fs from "fs";
import Papa from "papaparse";
import dotenv from "dotenv";
import BN from "bn.js";
dotenv.config();

const RPC_URL = process.env.ENDPOINT!;

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

async function getAllProfileAccounts(
  url: string
): Promise<Record<string, any>> {
  const response = await axios({
    method: "post",
    url: url,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [
        PROFILE_ADDRESS,
        {
          encoding: "base64+zstd",
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from("c25ab5a0b6ce749e", "hex")), // Identity account discriminator
              },
            },
          ],
        },
      ],
    },
  });

  const mapping = response.data.result.reduce(
    (obj: Record<string, any>, x: any) => {
      obj[x.pubkey] = x.account.data[0];
      return obj;
    },
    {} as Record<string, any>
  );

  return mapping;
}

const connection = new Connection(RPC_URL);
const profileConnection = new ProfileConnection(
  connection,
  new NodeWallet(new Keypair())
);

async function main() {
  await ZstdInit();

  const stakeConnection = await StakeConnection.connect(
    connection,
    new NodeWallet(new Keypair())
  );
  const stakeAccounts = await getAllStakeAccounts(RPC_URL);
  const profileAccounts = await getAllProfileAccounts(RPC_URL);

  const stakers: {
    owner: PublicKey;
    stakedAmount: BN;
    timeOfFirstStake: BN;
  }[] = stakeAccounts.map((x, index) => {
    console.log("Processing staker with key:", index, x.publicKey.toString());
    // console.log(x.publicKey.toString())
    const accountData = ZstdStream.decompress(
      new Uint8Array(Buffer.from(x.data, "base64"))
    );
    return stakeConnection.getStakerAndAmountFromPositionAccountData(
      Buffer.from(accountData)
    );
  });

  const stakersWithProfile = stakers.map(
    ({ owner, stakedAmount, timeOfFirstStake }, index) => {
      console.log("Processing profile :", index);
      const profileAddress = getIdentityAccountAddress(owner, "evm");
      let identity = "";
      if (profileAccounts[profileAddress.toString()]) {
        const accountData = ZstdStream.decompress(
          new Uint8Array(
            Buffer.from(profileAccounts[profileAddress.toString()], "base64")
          )
        );
        identity = profileConnection.getIdentityFromProfileAccountData(
          Buffer.from(accountData)
        );
      }
      return {
        solana: owner,
        stakedAmount: stakedAmount.toString(),
        timeOfFirstStake: timeOfFirstStake.toString(),
        evm: identity,
      };
    }
  );

  const date = Date.now();

  if (!fs.existsSync("snapshots")) {
    fs.mkdirSync("snapshots");
  }

  fs.writeFileSync(
    `snapshots/snapshot-${date.toString()}.json`,
    JSON.stringify({}, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    `snapshots/snapshot-${date.toString()}.csv`,
    Papa.unparse({}, { header: true, skipEmptyLines: true }),
    "utf-8"
  );
}

main();
