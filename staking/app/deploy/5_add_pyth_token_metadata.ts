import { Connection, Transaction } from "@solana/web3.js";
import { AUTHORITY_KEYPAIR, RPC_NODE, PYTH_TOKEN } from "./devnet";
import { Metaplex } from "@metaplex-foundation/js";
import {
  createCreateMetadataAccountV2Instruction,
  DataV2,
} from "@metaplex-foundation/mpl-token-metadata";

async function main() {
  const PYTH_ONCHAIN_METADATA = {
    name: "Pyth",
    symbol: "PYTH",
    uri: "https://arweave.net/V-UQtAKq6zfbVC7C7vkgjgxAc5lnJ6dAyXNs8MQrXyY",
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null,
  } as DataV2;

  const client = new Connection(RPC_NODE);
  const metaplex = Metaplex.make(client);
  const metadataPDA = metaplex.nfts().pdas().metadata({ mint: PYTH_TOKEN });

  const tx = new Transaction();
  tx.instructions.push(
    createCreateMetadataAccountV2Instruction(
      {
        metadata: metadataPDA,
        mint: PYTH_TOKEN,
        mintAuthority: AUTHORITY_KEYPAIR.publicKey,
        payer: AUTHORITY_KEYPAIR.publicKey,
        updateAuthority: AUTHORITY_KEYPAIR.publicKey,
      },
      {
        createMetadataAccountArgsV2: {
          data: PYTH_ONCHAIN_METADATA,
          isMutable: true,
        },
      }
    )
  );

  await client.sendTransaction(tx, [AUTHORITY_KEYPAIR]);
}

main();
