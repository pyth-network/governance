import { Wallet } from "@project-serum/anchor";
import { Provider } from "@project-serum/common";
import { PublicKey } from "@solana/web3.js";
import { StakeConnection } from "./StakeConnection";

export const PYTH_STAKING_ID = new PublicKey(
  "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
);

export class PythClient {
  program: { programId: PublicKey };
  constructor(public stakeConnection: StakeConnection) {
    this.program = {
      programId: PYTH_STAKING_ID,
    };
  }
  static async connect(provider: Provider): Promise<PythClient> {
    return new PythClient(
      await StakeConnection.createStakeConnection(
        provider.connection,
        provider.wallet as unknown as Wallet,
        PYTH_STAKING_ID
      )
    );
  }
}
