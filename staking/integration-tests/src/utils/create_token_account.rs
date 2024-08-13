use {
    anchor_spl::token::spl_token,
    solana_sdk::{
        program_pack::Pack,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    spl_token::{
        instruction::initialize_account,
        state::Account,
    },
};


pub fn create_token_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Pubkey,
) -> Keypair {
    let keypair = Keypair::new();
    let rent_exemption = svm.minimum_balance_for_rent_exemption(Account::LEN);

    let create_account_ix = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &keypair.pubkey(),
        rent_exemption,
        Account::LEN as u64,
        &spl_token::ID,
    );

    let initialize_account_ix = initialize_account(
        &spl_token::ID,
        &keypair.pubkey(),
        pyth_token_mint,
        &payer.pubkey(),
    )
    .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[create_account_ix, initialize_account_ix],
        Some(&payer.pubkey()),
        &[payer, &keypair],
        svm.latest_blockhash(),
    );

    svm.send_transaction(transaction).unwrap();

    keypair
}
