use {
    anchor_lang::AccountDeserialize,
    anchor_spl::token::TokenAccount,
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::{
            instructions::{
                advance,
                advance_delegation_record,
                delegate,
                set_publisher_stake_account,
                undelegate,
                update_delegation_fee,
            },
            pda::get_pool_reward_custody_address,
        },
        publisher_caps::{
            helper_functions::post_dummy_publisher_caps,
            utils::get_dummy_publisher,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::{
            instructions::airdrop_spl,
            utils::{
                fetch_account_data,
                fetch_account_data_bytemuck,
            },
        },
        staking::{
            helper_functions::initialize_new_stake_account,
            pda::get_stake_account_custody_address,
        },
        utils::{
            clock::{
                advance_n_epochs,
                get_current_epoch,
            },
            constants::{
                STAKED_TOKENS,
                YIELD,
            },
        },
    },
    integrity_pool::{
        error::IntegrityPoolError,
        state::{
            event::Event,
            pool::PoolData,
        },
        utils::{
            constants::{
                MAX_EVENTS,
                MAX_PUBLISHERS,
            },
            types::FRAC_64_MULTIPLIER,
        },
    },
    solana_sdk::{
        pubkey::Pubkey,
        signer::Signer,
    },
};

#[test]
fn test_advance() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint: _,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
        maybe_publisher_index,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let publisher_index = maybe_publisher_index.unwrap();
    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    let mut publisher_pubkeys = (1..MAX_PUBLISHERS - 1)
        .map(get_dummy_publisher)
        .collect::<Vec<Pubkey>>();
    publisher_pubkeys.sort();
    publisher_pubkeys.push(Pubkey::default());


    for i in 0..MAX_PUBLISHERS {
        match i {
            i if i < publisher_index => assert_eq!(pool_data.publishers[i], publisher_pubkeys[i]),
            i if i > publisher_index => {
                assert_eq!(pool_data.publishers[i], publisher_pubkeys[i - 1])
            }
            _ => (),
        }
    }
    assert_eq!(pool_data.last_updated_epoch, 2);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    let publisher_caps_2 =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    assert_anchor_program_error!(
        advance(&mut svm, &payer, publisher_caps),
        IntegrityPoolError::PoolDataAlreadyUpToDate,
        0
    );

    // one epoch later, the caps are outdated
    advance_n_epochs(&mut svm, &payer, 1);

    assert_anchor_program_error!(
        advance(&mut svm, &payer, publisher_caps_2),
        IntegrityPoolError::OutdatedPublisherCaps,
        0
    );
}

#[test]
fn test_advance_reward_events() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
        maybe_publisher_index,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let publisher_index = maybe_publisher_index.unwrap();
    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 1);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 8);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 9);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 10);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    assert_eq!(pool_data.events[0].epoch, 0);
    assert_eq!(pool_data.events[0].y, YIELD);
    assert_eq!(pool_data.events[0].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[0].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[1].epoch, 1);
    assert_eq!(pool_data.events[1].y, YIELD);
    assert_eq!(pool_data.events[1].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[1].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[2].epoch, 2);
    assert_eq!(pool_data.events[2].y, YIELD);
    assert_eq!(pool_data.events[2].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[2].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[3].epoch, 3);
    assert_eq!(pool_data.events[3].y, YIELD);
    assert_eq!(
        pool_data.events[3].event_data[publisher_index].other_reward_ratio,
        1_000_000
    );
    assert_eq!(
        pool_data.events[3].event_data[publisher_index].self_reward_ratio,
        0
    );
    for i in 4..12 {
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].other_reward_ratio,
            500_000,
        );
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].self_reward_ratio,
            0
        );
        assert_eq!(pool_data.events[i].epoch, STARTING_EPOCH + i as u64 - 2);
        assert_eq!(pool_data.events[i].y, YIELD);
    }
    for i in 12..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }
}


#[test]
fn test_reward_events_with_delegation_fee() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority,
        maybe_publisher_index,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });
    let publisher_index = maybe_publisher_index.unwrap();

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);
    let publisher_stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    update_delegation_fee(
        &mut svm,
        &payer,
        pool_data_pubkey,
        &reward_program_authority,
        FRAC_64_MULTIPLIER / 20,
    )
    .unwrap();

    set_publisher_stake_account(
        &mut svm,
        &payer,
        &publisher_keypair,
        publisher_keypair.pubkey(),
        None,
        publisher_stake_account_positions,
    )
    .unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        publisher_stake_account_positions,
        100 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 2);

    let publisher_caps = post_dummy_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        200 * FRAC_64_MULTIPLIER,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    assert_eq!(pool_data.events[3].epoch, 3);
    assert_eq!(pool_data.events[3].y, YIELD);
    assert_eq!(
        pool_data.events[3].event_data[publisher_index].other_reward_ratio,
        FRAC_64_MULTIPLIER,
    );
    assert_eq!(
        pool_data.events[3].event_data[publisher_index].self_reward_ratio,
        FRAC_64_MULTIPLIER,
    );
    assert_eq!(
        pool_data.events[3].event_data[publisher_index].delegation_fee,
        FRAC_64_MULTIPLIER / 20,
    );

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        Some(publisher_stake_account_positions),
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

    // reward = 1 epoch * 50 PYTH * YIELD - 5% delegation fee
    assert_eq!(
        custody_data.amount,
        STAKED_TOKENS + 50 * YIELD - 50 * YIELD / 20
    );

    let publisher_stake_account_custody =
        get_stake_account_custody_address(publisher_stake_account_positions);
    let publisher_custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&publisher_stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // publisher reward = 50 PYTH * YIELD * 5%
    assert_eq!(
        publisher_custody_data.amount,
        STAKED_TOKENS + 50 * YIELD / 20
    );


    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        publisher_stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        Some(publisher_stake_account_positions),
    )
    .unwrap();

    let publisher_custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&publisher_stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // reward = 1 epoch * 100 PYTH * YIELD (no delegation fee)
    assert_eq!(
        publisher_custody_data.amount,
        STAKED_TOKENS + 50 * YIELD / 20 + 100 * YIELD
    );
}

#[test]
fn test_reward_after_undelegate() {
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

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);

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

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        0,
        50 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);

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

    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);
    let custody_data = anchor_spl::token::TokenAccount::try_deserialize(
        &mut svm
            .get_account(&stake_account_custody)
            .unwrap()
            .data
            .as_slice(),
    )
    .unwrap();

    // reward should be given even when it's undelegating
    assert_eq!(custody_data.amount, STAKED_TOKENS + 50 * YIELD);
}

#[test]
fn test_not_enough_rewards() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
        maybe_publisher_index,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: Some(FRAC_64_MULTIPLIER),
    });

    let publisher_index = maybe_publisher_index.unwrap();
    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        STAKED_TOKENS / 2,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 1);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), STAKED_TOKENS);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        STAKED_TOKENS / 2,
    )
    .unwrap();

    // not enough rewards
    advance_n_epochs(&mut svm, &payer, 8);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 9);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), STAKED_TOKENS);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let expected_yield =
        YIELD * FRAC_64_MULTIPLIER / (((15 * STAKED_TOKENS / 2) * YIELD) / FRAC_64_MULTIPLIER); // 2 * Y / 15
    let expected_claimable_rewards =
        (15 * (STAKED_TOKENS / 2) * expected_yield) / FRAC_64_MULTIPLIER;

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    for i in 0..3 {
        assert_eq!(pool_data.events[i].epoch, i as u64);
        assert_eq!(pool_data.events[i].y, YIELD);
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].other_reward_ratio,
            0
        );
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].self_reward_ratio,
            0
        );
    }

    for i in 3..11 {
        assert_eq!(pool_data.events[i].epoch, i as u64);
        assert_eq!(pool_data.events[i].y, expected_yield);
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].other_reward_ratio,
            1_000_000
        );
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].self_reward_ratio,
            0
        );
    }


    for i in 11..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }

    assert_eq!(expected_claimable_rewards, pool_data.claimable_rewards);

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

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 0);

    let remaining_rewards: u64 = fetch_account_data::<TokenAccount>(
        &mut svm,
        &get_pool_reward_custody_address(pyth_token_mint.pubkey()),
    )
    .amount;
    assert_eq!(
        remaining_rewards,
        FRAC_64_MULTIPLIER - expected_claimable_rewards
    ); // 250u64

    // yield should be very low now
    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 10);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), STAKED_TOKENS);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let expected_yield =
        (YIELD * remaining_rewards) / ((YIELD * STAKED_TOKENS) / FRAC_64_MULTIPLIER); // 2u64
    let expected_claimable_rewards_2 = (STAKED_TOKENS * expected_yield) / FRAC_64_MULTIPLIER; // 200u64

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    assert_eq!(pool_data.events[11].epoch, 11);
    assert_eq!(pool_data.events[11].y, expected_yield);
    assert_eq!(
        pool_data.events[11].event_data[publisher_index].other_reward_ratio,
        1_000_000
    );
    assert_eq!(
        pool_data.events[11].event_data[publisher_index].self_reward_ratio,
        0
    );
    for i in 12..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }

    assert_eq!(expected_claimable_rewards_2, pool_data.claimable_rewards);

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
    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 0);


    let remaining_rewards: u64 = fetch_account_data::<TokenAccount>(
        &mut svm,
        &get_pool_reward_custody_address(pyth_token_mint.pubkey()),
    )
    .amount;
    assert_eq!(
        remaining_rewards,
        FRAC_64_MULTIPLIER - expected_claimable_rewards_2 - expected_claimable_rewards
    ); // 50u64

    // yield should be zero now
    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 11);

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), STAKED_TOKENS);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.events[12].epoch, 12);
    assert_eq!(pool_data.events[12].y, 0);
    assert_eq!(
        pool_data.events[12].event_data[publisher_index].other_reward_ratio,
        1_000_000
    );
    assert_eq!(
        pool_data.events[12].event_data[publisher_index].self_reward_ratio,
        0
    );
    for i in 13..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }
    assert_eq!(pool_data.claimable_rewards, 0);

    // now airdrop, back to normal
    airdrop_spl(
        &mut svm,
        &payer,
        get_pool_reward_custody_address(pyth_token_mint.pubkey()),
        &pyth_token_mint,
        2 * FRAC_64_MULTIPLIER,
    );
    advance_n_epochs(&mut svm, &payer, 2);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 13);
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), STAKED_TOKENS);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.events[13].epoch, 13);
    assert_eq!(pool_data.events[13].y, YIELD);
    assert_eq!(
        pool_data.events[13].event_data[publisher_index].other_reward_ratio,
        1_000_000
    );
    assert_eq!(
        pool_data.events[13].event_data[publisher_index].self_reward_ratio,
        0
    );

    assert_eq!(pool_data.events[14].epoch, 14);
    assert_eq!(pool_data.events[14].y, YIELD);
    assert_eq!(
        pool_data.events[14].event_data[publisher_index].other_reward_ratio,
        1_000_000
    );
    assert_eq!(
        pool_data.events[14].event_data[publisher_index].self_reward_ratio,
        0
    );

    for i in 15..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }
    assert_eq!(pool_data.claimable_rewards, 2 * FRAC_64_MULTIPLIER);

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
    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.claimable_rewards, 0);
}
