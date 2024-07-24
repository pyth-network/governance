use {
    crate::utils::account::fetch_account_data_bytemuck,
    anchor_lang::prelude::Error,
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
    publisher_caps::{
        get_dummy_publisher,
        MAX_CAPS,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signer::Signer,
    },
    utils::{
        clock::{
            advance_n_epochs,
            get_current_epoch,
        },
        error::assert_anchor_program_error,
        integrity_pool::{
            advance::advance,
            delegate::delegate,
        },
        publisher_caps::post_publisher_caps::post_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::create_stake_account::create_stake_account,
    },
};

pub mod utils;

#[test]
fn test_advance() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);

    assert_eq!(pool_data.publishers[0], publisher_keypair.pubkey());
    for i in 1..MAX_PUBLISHERS {
        if i < MAX_CAPS {
            assert_eq!(pool_data.publishers[i], get_dummy_publisher(i));
        } else {
            assert_eq!(pool_data.publishers[i], Pubkey::default());
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
    assert_eq!(pool_data.events[0].y, 10);
    assert_eq!(pool_data.events[0].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[0].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[1].epoch, 2);
    assert_eq!(pool_data.events[1].y, 10);
    assert_eq!(pool_data.events[1].event_data[0].other_reward_ratio, 0);
    assert_eq!(pool_data.events[1].event_data[0].self_reward_ratio, 0);
    assert_eq!(pool_data.events[2].epoch, 3);
    assert_eq!(pool_data.events[2].y, 10);
    assert_eq!(
        pool_data.events[2].event_data[0].other_reward_ratio,
        1_000_000
    );
    assert_eq!(pool_data.events[2].event_data[0].self_reward_ratio, 0);
    for i in 3..11 {
        assert_eq!(
            pool_data.events[i].event_data[0].other_reward_ratio,
            500_000,
        );
        assert_eq!(pool_data.events[i].event_data[0].self_reward_ratio, 0);
        assert_eq!(pool_data.events[i].epoch, 1 + i as u64);
        assert_eq!(pool_data.events[i].y, 10);
    }
    for i in 11..MAX_EVENTS {
        assert_eq!(pool_data.events[i], Event::default())
    }
}
