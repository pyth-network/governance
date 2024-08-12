import { BorshCoder, IdlTypes } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Staking } from "../target/types/staking";
import { Position, wasm } from "./StakeConnection";

export class PositionAccountJs {
  public owner: PublicKey;
  public positions: Position[];

  constructor(buffer: Buffer, idl: Staking) {
    const coder = new BorshCoder(idl);
    let i = 8; // Skip discriminator
    this.owner = new PublicKey(buffer.slice(i, i + 32));
    let numberOfPositions = Math.floor(
      (buffer.length - 40) / wasm.Constants.POSITION_BUFFER_SIZE()
    );
    i += 32;
    this.positions = [];
    for (let j = 0; j < numberOfPositions; j++) {
      if (buffer[i] === 1) {
        this.positions.push(
          coder.types.decode("position", buffer.subarray(i + 1))
        );
      } else {
        this.positions.push(null);
      }
      i += wasm.Constants.POSITION_BUFFER_SIZE();
    }
  }
}
