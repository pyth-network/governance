use {
    super::pda::{
        get_pool_config_address,
        get_pool_reward_custody_address,
    },
    crate::utils::mint::airdrop_spl,
    anchor_lang::solana_program::pubkey::Pubkey,
    anchor_spl::{
        associated_token::spl_associated_token_account,
        token::spl_token,
    },
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    litesvm::types::TransactionResult,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};


pub fn initialize_ata(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    mint: Pubkey,
    authority: Pubkey,
) -> TransactionResult {
    // Create the ATA for the pool_config_pubkey if it doesn't exist
    let create_ata_ix = spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        &authority,
        &mint,
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


pub fn initialize_pool_reward_custody(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: Pubkey,
) {
    let (pool_config_pubkey, _) = get_pool_config_address();

    // Create the ATA for the pool_config_pubkey if it doesn't exist
    initialize_ata(svm, payer, pyth_token_mint, pool_config_pubkey).unwrap();

    airdrop_spl(
        svm,
        payer,
        get_pool_reward_custody_address(pyth_token_mint),
        pyth_token_mint,
        1_000_000 * FRAC_64_MULTIPLIER,
    );
}
