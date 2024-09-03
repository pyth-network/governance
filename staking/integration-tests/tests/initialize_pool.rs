use {
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::{
            instructions::{
                create_pool_data_account,
                update_pyth_token_mint,
                update_y,
            },
            pda::get_pool_config_address,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::fetch_account_data,
        utils::constants::YIELD,
    },
    integrity_pool::{
        error::IntegrityPoolError,
        state::pool::PoolConfig,
        utils::types::FRAC_64_MULTIPLIER,
    },
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
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    // Pool data should be setup correctly
    let pool_config_pubkey = get_pool_config_address();
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
    assert_anchor_program_error!(initialize_pool_2_res, ProgramError::Custom(0), 1);
}

#[test]
fn test_update_y() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint: _,
        publisher_keypair: _,
        pool_data_pubkey: _,
        reward_program_authority,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let pool_config_pubkey = get_pool_config_address();
    let pool_config: PoolConfig = fetch_account_data(&mut svm, &pool_config_pubkey);

    assert!(pool_config.y == YIELD);

    update_y(&mut svm, &payer, &reward_program_authority, 123).unwrap();

    let pool_config: PoolConfig = fetch_account_data(&mut svm, &pool_config_pubkey);
    assert!(pool_config.y == 123);

    // Trying to update the yield without the correct authority should fail
    let wrong_authority = Keypair::new();

    assert_anchor_program_error!(
        update_y(&mut svm, &payer, &wrong_authority, 456),
        IntegrityPoolError::InvalidRewardProgramAuthority,
        0
    );

    assert_anchor_program_error!(
        update_y(
            &mut svm,
            &payer,
            &reward_program_authority,
            FRAC_64_MULTIPLIER / 100 + 1
        ),
        IntegrityPoolError::InvalidY,
        0
    );
}

#[test]
fn test_update_pyth_token_mint() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        reward_program_authority,
        ..
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let pool_config_pubkey = get_pool_config_address();
    let pool_config: PoolConfig = fetch_account_data(&mut svm, &pool_config_pubkey);

    assert!(pool_config.pyth_token_mint == pyth_token_mint.pubkey());

    let new_mint = Pubkey::new_unique();
    update_pyth_token_mint(&mut svm, &payer, &reward_program_authority, new_mint).unwrap();

    let pool_config: PoolConfig = fetch_account_data(&mut svm, &pool_config_pubkey);
    assert!(pool_config.pyth_token_mint == new_mint);

    // Trying to update the pyth token mint without the correct authority should fail
    let wrong_authority = Keypair::new();

    assert_anchor_program_error!(
        update_pyth_token_mint(&mut svm, &payer, &wrong_authority, new_mint),
        IntegrityPoolError::InvalidRewardProgramAuthority,
        0
    );
}
