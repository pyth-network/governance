use {
    super::pda::{
        get_pool_config_address,
        get_pool_reward_custody_address,
    },
    crate::solana::instructions::{
        airdrop_spl,
        initialize_ata,
    },
    anchor_lang::solana_program::pubkey::Pubkey,
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    solana_sdk::signature::Keypair,
};


pub fn initialize_pool_reward_custody(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: Pubkey,
) {
    let pool_config_pubkey = get_pool_config_address();

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
