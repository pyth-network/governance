use {
    anchor_lang::{
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    integration_tests::{
        assert_anchor_program_error,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::{
            helper_functions::initialize_new_stake_account,
            instructions::{
                create_position,
                update_pool_authority,
            },
            pda::{
                get_config_address,
                get_stake_account_custody_address,
                get_stake_account_metadata_address,
                get_target_address,
            },
        },
    },
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    solana_sdk::{
        instruction::Instruction,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    staking::error::ErrorCode,
};


#[test]
fn test_pool_authority() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey: _,
        reward_program_authority: _,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    let pool_authority = Keypair::new();

    update_pool_authority(&mut svm, &payer, pool_authority.pubkey());

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        staking::state::positions::TargetWithParameters::IntegrityPool {
            publisher: publisher_keypair.pubkey(),
        },
        Some(&pool_authority),
        50 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    assert_anchor_program_error!(
        create_position(
            &mut svm,
            &payer,
            stake_account_positions,
            staking::state::positions::TargetWithParameters::IntegrityPool {
                publisher: publisher_keypair.pubkey(),
            },
            None,
            50 * FRAC_64_MULTIPLIER,
        ),
        ErrorCode::InvalidPoolAuthority,
        0
    );

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        staking::state::positions::TargetWithParameters::Voting,
        None,
        10 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    let config_pubkey = get_config_address();
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);
    let voting_target_account = get_target_address();

    let create_position_data = staking::instruction::CreatePosition {
        target_with_parameters: staking::state::positions::TargetWithParameters::IntegrityPool {
            publisher: publisher_keypair.pubkey(),
        },
        amount:                 10 * FRAC_64_MULTIPLIER,
    };

    let create_position_accs = staking::accounts::CreatePosition {
        config: config_pubkey,
        stake_account_metadata,
        stake_account_positions,
        stake_account_custody,
        owner: payer.pubkey(),
        target_account: Some(voting_target_account),
        pool_authority: Some(pool_authority.pubkey()),
        system_program: system_program::ID,
    };

    let create_position_ix = Instruction::new_with_bytes(
        staking::ID,
        &create_position_data.data(),
        create_position_accs.to_account_metas(None),
    );


    let create_position_tx = Transaction::new_signed_with_payer(
        &[create_position_ix],
        Some(&payer.pubkey()),
        &[&payer, &pool_authority],
        svm.latest_blockhash(),
    );

    assert_anchor_program_error!(
        svm.send_transaction(create_position_tx),
        ErrorCode::UnexpectedTargetAccount,
        0
    );
}
