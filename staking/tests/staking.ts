import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Staking } from "../target/types/staking";
import { TOKEN_PROGRAM_ID, Token, ASSOCIATED_TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";

const PYTH_MINT = new PublicKey("3ye7E2aTDUsFyCt6oQF8pRaWxN1hbhCtBgWLg9G6vZgJ");



describe("staking", async () => {

  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.Staking as Program<Staking>;
  const provider = anchor.Provider.local();

  const loaded = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('./pytY8XLyKgEV13L8r8WvtqYJG2zEXdciqs3qeNt5MhY.json').toString()))
  );

  console.log(loaded.publicKey.toBase58())

  const stake_account_secret = new Keypair();

  const [_stake_account_custody, _stake_account_custody_bump] =
  await PublicKey.findProgramAddress(
    [
      anchor.utils.bytes.utf8.encode("custody"),
      stake_account_secret.publicKey.toBuffer(),
    ],
    program.programId
  );

  const [_custody_authority, _custody_authority_bump] =
  await PublicKey.findProgramAddress(
    [
      anchor.utils.bytes.utf8.encode("authority"),
      stake_account_secret.publicKey.toBuffer(),
    ],
    program.programId
  );



  it("creates staking account", async () => {
    
    
    const owner = provider.wallet.publicKey;
    const tx = await program.rpc.createStakeAccount(
      owner,
      {vested:{}},
      _custody_authority_bump,
      {
        accounts: {
          payer: provider.wallet.publicKey,
          stakeAccount: stake_account_secret.publicKey,
          stakeAccountCustody: _stake_account_custody,
          custodyAuthority : _custody_authority,
          mint: PYTH_MINT,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [stake_account_secret],
      }
    );
    console.log("Your transaction signature", tx);
    console.log(await program.account.stakeAccountData.fetch( stake_account_secret.publicKey))
  });

  it("deposits tokens", async () => {

    const from_account = await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, PYTH_MINT, provider.wallet.publicKey);
    const to_account = _stake_account_custody;
    console.log(from_account.toBase58());
    console.log(to_account.toBase58());
    const ix = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from_account,
      to_account,
      provider.wallet.publicKey,
      [],
      1
    )
    await provider.send(new anchor.web3.Transaction().add(ix))
  });
});
