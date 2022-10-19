/// <reference types="node" />
import { Idl, IdlTypes } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Staking } from "../target/types/staking";
export declare type Position = IdlTypes<Staking>["Position"];
export declare class PositionAccountJs {
  owner: PublicKey;
  positions: Position[];
  constructor(buffer: Buffer, idl: Idl);
}
