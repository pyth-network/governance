use {
    integration_tests::{
        integrity_pool::{
            instructions::create_pool_data_account,
            pda::get_pool_config_address,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::fetch_account_data,
        utils::error::assert_anchor_program_error,
    },
    integrity_pool::state::pool::PoolConfig,
    solana_sdk::{
        program_error::ProgramError,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
};


#[test]
fn initialize_pool() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair: _,
        pool_data_pubkey,
        reward_program_authority: _,
        publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    // Pool data should be setup correctly
    let (pool_config_pubkey, _) = get_pool_config_address();
    let pool_config: PoolConfig = fetch_account_data(&mut svm, &pool_config_pubkey);

    assert!(pool_config.pool_data == pool_data_pubkey);

    // Trying to initialize the pool again should fail
    let pool_data2_keypair = Keypair::new();
    let initialize_pool_2_res = create_pool_data_account(
        &mut svm,
        &payer,
        &pool_data2_keypair,
        Pubkey::new_unique(),
        pyth_token_mint.pubkey(),
    );
    assert_anchor_program_error(initialize_pool_2_res, ProgramError::Custom(0).into(), 1);
}
