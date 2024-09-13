use {
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::instructions::{
            advance,
            advance_delegation_record,
            delegate,
        },
        publisher_caps::helper_functions::post_dummy_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::helper_functions::initialize_new_stake_account,
        utils::clock::advance_n_epochs,
    },
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    solana_sdk::signer::Signer,
    staking::error::ErrorCode,
};


#[test]
fn test_max_positions() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
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

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    for _ in 0..u8::MAX {
        svm.expire_blockhash();
        delegate(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            pool_data_pubkey,
            stake_account_positions,
            100,
        )
        .unwrap();
    }

    svm.expire_blockhash();
    assert_anchor_program_error!(
        delegate(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            pool_data_pubkey,
            stake_account_positions,
            100,
        ),
        ErrorCode::TooManyPositions,
        0
    );

    for _ in 0..10 {
        advance_n_epochs(&mut svm, &payer, 10);

        let publisher_caps = post_dummy_publisher_caps(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            200 * FRAC_64_MULTIPLIER,
        );
        advance(&mut svm, &payer, publisher_caps).unwrap();
    }


    let res = advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        None,
    )
    .unwrap();

    // make sure the CU is not too close to the limit
    assert!(res.compute_units_consumed < 1_350_000);

    advance_n_epochs(&mut svm, &payer, 10);
    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        200 * FRAC_64_MULTIPLIER,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        None,
    )
    .unwrap();
}
