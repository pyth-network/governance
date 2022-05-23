import { Idl, IdlTypes } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Staking } from "../target/types/staking";
import * as idljs from "@project-serum/anchor/dist/cjs/coder/borsh/idl";
import { IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl";
import { wasm } from "./StakeConnection";

export type Position = IdlTypes<Staking>["Position"];
export class PositionAccountJs {
  public owner: PublicKey;
  public positions: Position[];

  constructor(buffer: Buffer, idl: Idl) {
    // Fabricate a fake IDL for this so that we can leverage Anchor's Borsh decoding
    const optionPositionType = {
      name: "OptionPosition",
      type: {
        kind: "struct",
        fields: [{ name: "val", type: { option: { defined: "Position" } } }],
      },
    };
    const optionPositionLayout = idljs.IdlCoder.typeDefLayout(
      optionPositionType as unknown as IdlTypeDef,
      idl.types
    );
    // The position data account is zero-copy serialized with repr(C), so we're hand-writing in the deserialization.
    // This builds in the assumption that the layout of the account is:
    // * 8 byte discriminator
    // * Pubkey
    // * MAX_POSITION entries of Borsh serialized Positions, each taking SERIALIZED_POSITION_SIZE bytes
    // The code will adapt automatically if MAX_POSITION, SERIALIZED_POSITION_SIZE, or the layout of an individual position object changes,
    // but not if the overall layout changes
    // The alternative is to passing the buffer to wasm, having wasm return the buffers, and then deserializng them again like this.
    // I'm not sure that's worth that many memcopies.
    let i = 0;
    const discriminator = buffer.slice(i, i + 8);
    i += 8;
    this.owner = new PublicKey(buffer.slice(i, i + 32));
    i += 32;
    this.positions = [];
    for (let j = 0; j < wasm.Constants.MAX_POSITIONS(); j++) {
      this.positions.push(optionPositionLayout.decode(buffer, i).val);
      i += wasm.Constants.POSITION_BUFFER_SIZE();
    }
  }
}
