use {
    anchor_lang::{
        prelude::Error,
        AccountDeserialize,
    },
    integration_tests::{
        integrity_pool::instructions::{
            advance,
            advance_delegation_record,
            delegate,
            set_publisher_stake_account,
            undelegate,
            update_delegation_fee,
        },
        publisher_caps::{
            helper_functions::post_publisher_caps,
            utils::get_dummy_publisher,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::utils::fetch_account_data_bytemuck,
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
            error::assert_anchor_program_error,
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
        publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    let mut publisher_pubkeys = (1..MAX_PUBLISHERS)
        .map(get_dummy_publisher)
        .collect::<Vec<Pubkey>>();
    publisher_pubkeys.sort();

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

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    let publisher_caps_2 = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    assert_anchor_program_error(
        advance(&mut svm, &payer, publisher_caps),
        Error::from(IntegrityPoolError::PoolDataAlreadyUpToDate),
        0,
    );

    // one epoch later, the caps are outdated
    advance_n_epochs(&mut svm, &payer, 1);

    assert_anchor_program_error(
        advance(&mut svm, &payer, publisher_caps_2),
        Error::from(IntegrityPoolError::OutdatedPublisherCaps),
        0,
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
        publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

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

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
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

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), STARTING_EPOCH + 10);

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    assert_eq!(pool_data.events[0].epoch, 1);
    assert_eq!(pool_data.events[0].y, YIELD);
    assert_eq!(pool_data.events[0].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[0].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[1].epoch, 2);
    assert_eq!(pool_data.events[1].y, YIELD);
    assert_eq!(pool_data.events[1].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[1].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[2].epoch, 3);
    assert_eq!(pool_data.events[2].y, YIELD);
    assert_eq!(
        pool_data.events[2].event_data[publisher_index].other_reward_ratio,
        1_000_000
    );
    assert_eq!(
        pool_data.events[2].event_data[publisher_index].self_reward_ratio,
        0
    );
    for i in 3..11 {
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].other_reward_ratio,
            500_000,
        );
        assert_eq!(
            pool_data.events[i].event_data[publisher_index].self_reward_ratio,
            0
        );
        assert_eq!(pool_data.events[i].epoch, STARTING_EPOCH + i as u64 - 1);
        assert_eq!(pool_data.events[i].y, YIELD);
    }
    for i in 11..MAX_EVENTS {
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
        publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

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

    let publisher_caps = post_publisher_caps(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        200 * FRAC_64_MULTIPLIER,
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    assert_eq!(pool_data.events[2].epoch, 3);
    assert_eq!(pool_data.events[2].y, YIELD);
    assert_eq!(
        pool_data.events[2].event_data[publisher_index].other_reward_ratio,
        FRAC_64_MULTIPLIER,
    );
    assert_eq!(
        pool_data.events[2].event_data[publisher_index].self_reward_ratio,
        FRAC_64_MULTIPLIER,
    );
    assert_eq!(
        pool_data.events[2].event_data[publisher_index].delegation_fee,
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
        publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
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

    let publisher_caps = post_publisher_caps(
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

    let publisher_caps = post_publisher_caps(
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
