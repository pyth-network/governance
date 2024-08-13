use {
    anchor_lang::prelude::Error,
    integration_tests::{
        integrity_pool::instructions::{
            advance,
            delegate,
        },
        publisher_caps::instructions::{
            get_dummy_publisher,
            post_publisher_caps,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::fetch_account_data_bytemuck,
        staking::create_stake_account::create_stake_account,
        utils::{
            clock::{
                advance_n_epochs,
                get_current_epoch,
            },
            constants::YIELD,
            error::assert_anchor_program_error,
        },
    },
    integrity_pool::{
        error::IntegrityPoolError,
        state::{
            event::Event,
            pool::PoolData,
        },
        utils::constants::{
            MAX_EVENTS,
            MAX_PUBLISHERS,
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
        advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()),
        Error::from(IntegrityPoolError::PoolDataAlreadyUpToDate),
        0,
    );

    // one epoch later, the caps are outdated
    advance_n_epochs(&mut svm, &payer, 1);

    assert_anchor_program_error(
        advance(&mut svm, &payer, publisher_caps_2, pyth_token_mint.pubkey()),
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
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50,
    );

    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), 3);

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50,
    );

    advance_n_epochs(&mut svm, &payer, 8);
    assert_eq!(get_current_epoch(&mut svm), 11);

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();

    advance_n_epochs(&mut svm, &payer, 1);
    assert_eq!(get_current_epoch(&mut svm), 12);

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();

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
        assert_eq!(pool_data.events[i].epoch, 1 + i as u64);
        assert_eq!(pool_data.events[i].y, YIELD);
    }
    for i in 11..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }
}
