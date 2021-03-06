import { AnchorProvider, Wallet } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { DEVNET_STAKING_ADDRESS, LOCALNET_STAKING_ADDRESS } from "./constants";
import { StakeConnection } from "./StakeConnection";

export class PythClient {
  program: { programId: PublicKey };
  cluster: string;
  constructor(public stakeConnection: StakeConnection, cluster: string) {
    this.cluster = cluster;
    this.program = {
      programId:
        cluster === "localnet"
          ? LOCALNET_STAKING_ADDRESS
          : DEVNET_STAKING_ADDRESS,
    };
  }
  static async connect(
    provider: AnchorProvider,
    cluster: string
  ): Promise<PythClient> {
    // only supports localnet and devnet for now
    // TODO: update this to support mainnet when program is deployed
    return new PythClient(
      await StakeConnection.createStakeConnection(
        provider.connection,
        provider.wallet as unknown as Wallet,
        cluster === "localnet"
          ? LOCALNET_STAKING_ADDRESS
          : DEVNET_STAKING_ADDRESS
      ),
      cluster
    );
  }
}
