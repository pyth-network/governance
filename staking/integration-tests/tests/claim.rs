#![allow(clippy::identity_op)]

use {
    anchor_lang::AccountDeserialize,
    integration_tests::{
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
        solana::utils::fetch_account_data_bytemuck,
        staking::{
            helper_functions::initialize_new_stake_account,
            pda::get_stake_account_custody_address,
        },
        utils::{
            clock::advance_n_epochs,
            constants::{
                STAKED_TOKENS,
                YIELD,
            },
        },
    },
    integrity_pool::{
        state::pool::PoolData,
        utils::types::FRAC_64_MULTIPLIER,
    },
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
    },
};

#[test]
fn test_claim() {
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


    // delegate 1 token at epoch x
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        1 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);

    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        1 * FRAC_64_MULTIPLIER / 2,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 0);

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

    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // there already is 100 PYTH tokens in the custody account
    // during epoch x + 1, the reward is zero
    assert_eq!(custody_data.amount, STAKED_TOKENS + 0);

    advance_n_epochs(&mut svm, &payer, 1);

    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        1 * FRAC_64_MULTIPLIER / 2,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    // there are claimable rewards now
    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, YIELD * 1 / 2);

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

    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // we claimed everything
    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 0);

    // during epoch x + 2, the reward for epoch x + 1 can be claimed
    // y = YIELD, cap = 0.5 PYTH, delegated = 1 PYTH
    // reward = cap * YIELD
    assert_eq!(custody_data.amount, STAKED_TOKENS + YIELD * 1 / 2);

    // 3 epochs together
    // cap increased to 1.5 PYTH
    advance_n_epochs(&mut svm, &payer, 3);

    // cap for epoch x + 2 -> x + 4 will be 1.5 PYTH
    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        3 * FRAC_64_MULTIPLIER / 2,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    // claimable rewards matches what we are going to distribute
    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 3 * YIELD * 1);

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

    // we claimed everything
    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 0);

    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // 1 epoch * 0.5 PYTH * YIELD (epoch x + 1)
    // 3 epoch * 1 PYTH * YIELD (epoch x + 2 -> x + 4)
    assert_eq!(
        custody_data.amount,
        STAKED_TOKENS + YIELD * 1 / 2 + 3 * YIELD * 1
    );
}


#[test]
fn test_lost_reward() {
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


    // delegate at epoch x
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        1 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    // advance 200 epochs
    for _ in 0..20 {
        advance_n_epochs(&mut svm, &payer, 10);

        let publisher_caps = post_dummy_publisher_caps(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            1 * FRAC_64_MULTIPLIER,
        );
        advance(&mut svm, &payer, publisher_caps).unwrap();
    }

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

    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // user only get rewarded for the last 52 epochs
    // reward = 52 epochs * YIELD * 1 PYTH
    assert_eq!(custody_data.amount, STAKED_TOKENS + 52 * YIELD * 1);
}


#[test]
fn test_correct_position_states() {
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


    // delegate at epoch x
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        1 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);

    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        100 * FRAC_64_MULTIPLIER,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        5 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 2);

    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        100 * FRAC_64_MULTIPLIER,
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

    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // 1 epoch with 1 PYTH -> 1 * YIELD reward
    // 1 epoch with 1 + 5 PYTH -> 6 * YIELD reward
    assert_eq!(custody_data.amount, STAKED_TOKENS + 7 * YIELD);
}

#[test]
fn test_advance_delegation_record_permissionlessness() {
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


    // delegate at epoch x
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        1 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 2);

    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        1 * FRAC_64_MULTIPLIER,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let new_payer = Keypair::new();
    svm.airdrop(&new_payer.pubkey(), 100_000_000_000).unwrap();

    advance_delegation_record(
        &mut svm,
        &new_payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        None,
    )
    .unwrap();

    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    assert_eq!(custody_data.amount, STAKED_TOKENS + 1 * YIELD);
}
