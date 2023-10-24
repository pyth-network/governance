import { Wallet, AnchorProvider, Program } from "@project-serum/anchor";
import { Connection } from "@solana/web3.js";
import { getTargetAccount } from "../../tests/utils/utils";
import { AUTHORITY_KEYPAIR, PYTH_TOKEN, RPC_NODE } from "./devnet";
import { BN } from "bn.js";
import {
  STAKING_ADDRESS,
  REALM_ID,
  EPOCH_DURATION,
  GOVERNANCE_ADDRESS,
} from "../constants";

// Actual transaction hash :
// devnet (24/10/23): 4LDMVLijZsD3SeDMqeUZZ9mAov1TwyRJs96yuKztd7Cmv2p9ASWuP9JQXpL9fnr3eQc3gtxJqyWDZY1D7gj2NY6j
// mainnet-beta : KrWZD8gbH6Afg6suwHrmUi1xDo25rLDqqMAoAdunXmtUmuVk5HZgQvDqxFHC2uidL6TfXSmwKdQnkbnbZc8BZam

async function main() {
  const client = new Connection(RPC_NODE);
  const provider = new AnchorProvider(
    client,
    new Wallet(AUTHORITY_KEYPAIR),
    {}
  );
  const idl = (await Program.fetchIdl(STAKING_ADDRESS, provider))!;
  const program = new Program(idl, STAKING_ADDRESS, provider);

  const globalConfig = {
    governanceAuthority: AUTHORITY_KEYPAIR.publicKey,
    pythTokenMint: PYTH_TOKEN,
    pythGovernanceRealm: REALM_ID,
    unlockingDuration: 1,
    epochDuration: new BN(EPOCH_DURATION),
    freeze: false,
    pdaAuthority: AUTHORITY_KEYPAIR.publicKey,
    governanceProgram: GOVERNANCE_ADDRESS(),
    pythTokenListTime: null,
    agreementHash: Array.from(Buffer.alloc(0)),
  };
  await program.methods.initConfig(globalConfig).rpc();

  const votingTarget = { voting: {} };
  const targetAccount = await getTargetAccount(votingTarget, STAKING_ADDRESS);
  await program.methods
    .createTarget(votingTarget)
    .accounts({
      targetAccount,
      governanceSigner: AUTHORITY_KEYPAIR.publicKey,
    })
    .rpc();

  await program.methods.updateMaxVoterWeight().rpc();
}

main();
