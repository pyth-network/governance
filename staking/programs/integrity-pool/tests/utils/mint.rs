use {
    solana_program::system_instruction::create_account,
    solana_sdk::{
        program_pack::Pack,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    std::convert::TryInto,
};


pub fn init_mint_account(svm: &mut litesvm::LiteSVM, payer: &Keypair, pyth_token_mint: &Keypair) {
    let mint_rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let mint_tx = Transaction::new_signed_with_payer(
        &[
            create_account(
                &payer.pubkey(),
                &pyth_token_mint.pubkey(),
                mint_rent,
                spl_token::state::Mint::LEN.try_into().unwrap(),
                &spl_token::id(),
            ),
            spl_token::instruction::initialize_mint(
                &spl_token::id(),
                &pyth_token_mint.pubkey(),
                &payer.pubkey(),
                None,
                0,
            )
            .unwrap(),
        ],
        Some(&payer.pubkey()),
        &[&payer, &pyth_token_mint],
        svm.latest_blockhash(),
    );
    svm.send_transaction(mint_tx).unwrap();
}

pub fn airdrop_spl(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    destination: Pubkey,
    mint: Pubkey,
    amount: u64,
) {
    let mint_to_ix = spl_token::instruction::mint_to(
        &spl_token::id(),
        &mint,
        &destination,
        &payer.pubkey(),
        &[&payer.pubkey()],
        amount,
    )
    .unwrap();
    let mint_to_tx = Transaction::new_signed_with_payer(
        &[mint_to_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(mint_to_tx).unwrap();
}
