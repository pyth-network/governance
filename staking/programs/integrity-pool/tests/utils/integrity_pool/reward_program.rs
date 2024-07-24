use {
    super::pool_data::get_pool_config_address,
    anchor_spl::associated_token::{
        get_associated_token_address,
        spl_associated_token_account,
    },
    litesvm::types::TransactionResult,
    solana_program::pubkey::Pubkey,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};


pub fn get_pool_reward_custody_address(pyth_token_mint: Pubkey) -> Pubkey {
    let (pool_config_pubkey, _) = get_pool_config_address();

    get_associated_token_address(&pool_config_pubkey, &pyth_token_mint)
}

pub fn initialize_pool_reward_custody(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: Pubkey,
) -> TransactionResult {
    let (pool_config_pubkey, _) = get_pool_config_address();

    // Create the ATA for the pool_config_pubkey if it doesn't exist
    let create_ata_ix = spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        &pool_config_pubkey,
        &pyth_token_mint,
        &spl_token::ID,
    );

    let create_ata_tx = Transaction::new_signed_with_payer(
        &[create_ata_ix],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_ata_tx)
}
