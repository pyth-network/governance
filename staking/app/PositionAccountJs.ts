import {
  Coder,
  Idl,
  IdlAccounts,
  IdlError,
  IdlTypes,
} from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { Staking } from "../target/types/staking";
import * as idljs from "@project-serum/anchor/dist/cjs/coder/borsh/idl";
import { IdlTypeDef } from "@project-serum/anchor/dist/cjs/idl";

export type Position = IdlTypes<Staking>["Position"];
type PositionData = IdlAccounts<Staking>["positionData"];
export class PositionAccountJs {
  public owner: PublicKey;
  public positions: Position[];

  constructor(buffer: Buffer, idl: Idl, coder: Coder) {
    const deserialized1 = coder.accounts.decode<PositionData>(
      "PositionData",
      buffer
    );

    this.owner = deserialized1.owner;

    // Fabricate a fake IDL for Option<Position> so that we can leverage Anchor's Borsh decoding
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
    this.positions = [];
    for (const serializedPosition of deserialized1.positions as [][]) {
      this.positions.push(
        optionPositionLayout.decode(Buffer.from(serializedPosition)).val
      );
    }
  }
}
