"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionAccountJs = void 0;
const web3_js_1 = require("@solana/web3.js");
const idljs = __importStar(require("@project-serum/anchor/dist/cjs/coder/borsh/idl"));
const StakeConnection_1 = require("./StakeConnection");
class PositionAccountJs {
    constructor(buffer, idl) {
        // Fabricate a fake IDL for this so that we can leverage Anchor's Borsh decoding
        const optionPositionType = {
            name: "OptionPosition",
            type: {
                kind: "struct",
                fields: [{ name: "val", type: { option: { defined: "Position" } } }],
            },
        };
        const optionPositionLayout = idljs.IdlCoder.typeDefLayout(optionPositionType, idl.types);
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
        this.owner = new web3_js_1.PublicKey(buffer.slice(i, i + 32));
        i += 32;
        this.positions = [];
        for (let j = 0; j < StakeConnection_1.wasm.Constants.MAX_POSITIONS(); j++) {
            this.positions.push(optionPositionLayout.decode(buffer, i).val);
            i += StakeConnection_1.wasm.Constants.POSITION_BUFFER_SIZE();
        }
    }
}
exports.PositionAccountJs = PositionAccountJs;
