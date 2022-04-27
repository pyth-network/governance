import { Wallet } from "@project-serum/anchor";
import { Provider } from "@project-serum/common";
import { PublicKey } from "@solana/web3.js";
import { DEVNET_STAKING_ADDRESS, LOCALNET_STAKING_ADDRESS } from "./constants";
import { PythBalance } from "./pythBalance";
import { StakeAccount, StakeConnection } from "./StakeConnection";

export class PythClient {
  program: { programId: PublicKey };
  cluster: string;
  stakeAccount: StakeAccount;
  voterWeight: PythBalance;
  constructor(public stakeConnection: StakeConnection, cluster: string) {
    this.cluster = cluster;
    this.program = {
      programId:
        cluster === "localnet"
          ? LOCALNET_STAKING_ADDRESS
          : DEVNET_STAKING_ADDRESS,
    };
    this.stakeAccount = null;
    this.voterWeight = PythBalance.fromString("0");
  }
  static async connect(
    provider: Provider,
    cluster: string
  ): Promise<PythClient> {
    // only supports localnet and devnet for now
    // TODO: update this to support mainnet when program is deployed
    const stakeConnection = await StakeConnection.createStakeConnection(
      provider.connection,
      provider.wallet as unknown as Wallet,
      cluster === "localnet" ? LOCALNET_STAKING_ADDRESS : DEVNET_STAKING_ADDRESS
    );
    return new PythClient(stakeConnection, cluster);
  }

  public async update(publicKey: PublicKey) {
    this.stakeAccount = await this.stakeConnection.getMainAccount(publicKey);
    this.voterWeight = this.stakeAccount?.getVoterWeight(
      await this.stakeConnection.getTime()
    );
  }
}
