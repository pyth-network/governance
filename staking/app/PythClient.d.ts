import { AnchorProvider } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { StakeConnection } from "./StakeConnection";
export declare class PythClient {
  stakeConnection: StakeConnection;
  program: {
    programId: PublicKey;
  };
  cluster: string;
  constructor(stakeConnection: StakeConnection, cluster: string);
  static connect(
    provider: AnchorProvider,
    cluster: string
  ): Promise<PythClient>;
}
