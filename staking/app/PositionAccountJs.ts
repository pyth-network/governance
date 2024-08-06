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

    this.positions = [];
    for (let j = 0; j < 20; j++) {
      let positionOffset = getPositionOffset(j);
      if (buffer[positionOffset] === 1) {
        this.positions.push(
          coder.types.decode("position", buffer.subarray(positionOffset + 1))
        );
      } else {
        this.positions.push(null);
      }
    }
  }
}

function getPositionOffset(index: number): number {
  return (
    40 +
    wasm.Constants.POSITION_BUFFER_SIZE() *
      (2 * (index % 20) + Math.floor(index / 20))
  );
}
