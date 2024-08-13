use {
    anchor_lang::Key,
    anchor_spl::associated_token::get_associated_token_address,
    integrity_pool::utils::constants::{
        DELEGATION_RECORD,
        POOL_CONFIG,
        SLASH_EVENT,
    },
    solana_sdk::pubkey::Pubkey,
};

pub fn get_delegation_record_address(
    publisher: Pubkey,
    stake_account_positions: Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            DELEGATION_RECORD.as_bytes(),
            publisher.as_ref(),
            stake_account_positions.as_ref(),
        ],
        &integrity_pool::ID,
    )
}

pub fn get_pool_config_address() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[POOL_CONFIG.as_bytes()], &integrity_pool::ID)
}

pub fn get_pool_reward_custody_address(pyth_token_mint: Pubkey) -> Pubkey {
    let (pool_config_pubkey, _) = get_pool_config_address();

    get_associated_token_address(&pool_config_pubkey, &pyth_token_mint)
}

pub fn get_slash_event_address(index: u64, publisher: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SLASH_EVENT.as_bytes(),
            publisher.key().as_ref(),
            &index.to_be_bytes(),
        ],
        &integrity_pool::ID,
    )
}
