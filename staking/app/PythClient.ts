import { Wallet } from "@project-serum/anchor";
import { Provider } from "@project-serum/common";
import { PublicKey } from "@solana/web3.js";
import { LOCALNET_STAKING_ADDRESS } from "./constants";
import { StakeConnection } from "./StakeConnection";

export class PythClient {
  program: { programId: PublicKey };
  constructor(public stakeConnection: StakeConnection) {
    this.program = {
      programId: LOCALNET_STAKING_ADDRESS,
    };
  }
  static async connect(provider: Provider): Promise<PythClient> {
    return new PythClient(
      await StakeConnection.createStakeConnection(
        provider.connection,
        provider.wallet as unknown as Wallet,
        LOCALNET_STAKING_ADDRESS
      )
    );
  }
}
