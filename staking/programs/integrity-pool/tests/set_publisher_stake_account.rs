use {
    anchor_lang::{
        error::ErrorCode,
        prelude::Error,
    },
    integrity_pool::{
        error::IntegrityPoolError,
        state::pool::{
            DelegationState,
            PoolData,
        },
        utils::constants::MAX_PUBLISHERS,
    },
    solana_program::pubkey::Pubkey,
    solana_sdk::signer::Signer,
    utils::{
        account::fetch_account_data_bytemuck,
        clock::advance_n_epochs,
        error::assert_anchor_program_error,
        integrity_pool::{
            advance::advance,
            delegate::{
                advance_delegation_record,
                delegate,
                undelegate,
            },
            set_publisher_stake_account::set_publisher_stake_account,
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
fn test_set_publisher_stake_account() {
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
    let stake_account_positions_2 =
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);
    let stake_account_positions_3 =
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    // payer tries to set publisher stake account
    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            None,
            stake_account_positions,
        ),
        Error::from(IntegrityPoolError::PublisherNeedsToSign),
        0,
    );

    // now the actual publisher signs
    assert!(set_publisher_stake_account(
        &mut svm,
        &payer,
        &publisher_keypair,
        publisher_keypair.pubkey(),
        None,
        stake_account_positions
    )
    .is_ok());

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.publisher_stake_accounts[0],
        stake_account_positions,
    );

    // now only the stake account owner can change this, the publisher fails to change it
    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &publisher_keypair,
            publisher_keypair.pubkey(),
            Some(stake_account_positions),
            stake_account_positions_2,
        ),
        Error::from(IntegrityPoolError::StakeAccountOwnerNeedsToSign),
        0,
    );

    // missing the current stake account, fail
    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            None,
            stake_account_positions_2,
        ),
        Error::from(ErrorCode::AccountNotEnoughKeys),
        0,
    );

    // current stake account is wrong
    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            Some(stake_account_positions_2),
            stake_account_positions_2,
        ),
        Error::from(IntegrityPoolError::PublisherStakeAccountMismatch),
        0,
    );

    // new stake account is delegated
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_3,
        100,
    );

    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            Some(stake_account_positions),
            stake_account_positions_3,
        ),
        Error::from(IntegrityPoolError::NewStakeAccountShouldBeUndelegated),
        0,
    );


    // owner can change it
    assert!(set_publisher_stake_account(
        &mut svm,
        &payer,
        &payer,
        publisher_keypair.pubkey(),
        Some(stake_account_positions),
        stake_account_positions_2
    )
    .is_ok());

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.publisher_stake_accounts[0],
        stake_account_positions_2,
    );


    // current stake account should be undelegated
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_2,
        90,
    );

    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            Some(stake_account_positions_2),
            stake_account_positions_3,
        ),
        Error::from(IntegrityPoolError::CurrentStakeAccountShouldBeUndelegated),
        0,
    );

    // lastly, if the publisher doesn't exist, fail
    assert_anchor_program_error(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            Pubkey::new_unique(),
            Some(stake_account_positions),
            stake_account_positions_2,
        ),
        Error::from(IntegrityPoolError::PublisherNotFound),
        0,
    );

    // test the interactions between set_publisher_stake_account and delegate/undelegate
    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 100,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_3
    assert_eq!(pool_data.prev_del_state[0], DelegationState::default());
    assert_eq!(
        pool_data.self_del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 90,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_2
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    // now the self delegated account undelegates
    assert!(advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions_2
    )
    .is_ok());
    assert!(undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_2,
        0,
        1
    )
    .is_ok());

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 100,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_3
    assert_eq!(pool_data.prev_del_state[0], DelegationState::default());
    assert_eq!(
        pool_data.self_del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 89,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_2
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    // new epoch
    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    assert!(advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).is_ok());

    assert!(advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions_2
    )
    .is_ok());
    assert!(undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_2,
        0,
        9
    )
    .is_ok());

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          100,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_3
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 100,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.self_del_state[0],
        DelegationState {
            total_delegation:          89,
            positive_delta_delegation: 0,
            negative_delta_delegation: 9,
        }
    ); // stake_account_positions_2
    assert_eq!(
        pool_data.prev_self_del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 89,
            negative_delta_delegation: 0,
        }
    );

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }


    // new epoch
    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    assert!(advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).is_ok());

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          100,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_3
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          100,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.self_del_state[0],
        DelegationState {
            total_delegation:          80,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    ); // stake_account_positions_2
    assert_eq!(
        pool_data.prev_self_del_state[0],
        DelegationState {
            total_delegation:          89,
            positive_delta_delegation: 0,
            negative_delta_delegation: 9,
        }
    );

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }
}
