import {ProgramError } from "@project-serum/anchor";
import assert from "assert";

/**
 * Sends the rpc call and check whether the error message matches the provided string
 * @param rpc_call : anchor rpc call
 * @param error : expected string
 * @param idlErrors : mapping from error code to error message
 */
export async function expect_fail(rpc_call , error : string, idlErrors : Map<number,string>){
  try {
    const tx = await rpc_call.rpc();
    assert(false, "Transaction should fail");
  } catch (err) {
    if (err instanceof ProgramError) {
      assert.equal(
        parseErrorMessage(err, idlErrors),
        error
      );
    } else {
      throw err;
    }
  }
}


/**
 * Parses an error message from solana into a human-readable message
 */
export function parseErrorMessage(err: any, idlErrors: Map<number, string>) {
  if (err.msg)
    return err.msg;
  if (err.code)
    return idlErrors[err.code];
}