import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { PythGrantGumdrop } from "../target/types/pyth_grant_gumdrop";

describe("pyth-grant-gumdrop", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.PythGrantGumdrop as Program<PythGrantGumdrop>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
