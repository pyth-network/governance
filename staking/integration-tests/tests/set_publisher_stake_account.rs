use {
    anchor_lang::error::ErrorCode,
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::instructions::{
            advance,
            advance_delegation_record,
            delegate,
            set_publisher_stake_account,
            undelegate,
        },
        publisher_caps::helper_functions::post_dummy_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::fetch_account_data_bytemuck,
        staking::helper_functions::initialize_new_stake_account,
        utils::clock::advance_n_epochs,
    },
    integrity_pool::{
        error::IntegrityPoolError,
        state::pool::{
            DelegationState,
            PoolData,
        },
        utils::constants::MAX_PUBLISHERS,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signer::Signer,
    },
};


#[test]
fn test_set_publisher_stake_account() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
        maybe_publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });
    let publisher_index = maybe_publisher_index.unwrap();

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);
    let stake_account_positions_2 =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);
    let stake_account_positions_3 =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    // payer tries to set publisher stake account
    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            None,
            stake_account_positions,
        ),
        IntegrityPoolError::PublisherNeedsToSign,
        0
    );

    // now the actual publisher signs
    set_publisher_stake_account(
        &mut svm,
        &payer,
        &publisher_keypair,
        publisher_keypair.pubkey(),
        None,
        stake_account_positions,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);

    assert_eq!(
        pool_data.publisher_stake_accounts[publisher_index],
        stake_account_positions,
    );

    // now only the stake account owner can change this, the publisher fails to change it
    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &publisher_keypair,
            publisher_keypair.pubkey(),
            Some(stake_account_positions),
            stake_account_positions_2,
        ),
        IntegrityPoolError::StakeAccountOwnerNeedsToSign,
        0
    );

    // missing the current stake account, fail
    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            None,
            stake_account_positions_2,
        ),
        ErrorCode::AccountNotEnoughKeys,
        0
    );

    // current stake account is wrong
    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            Some(stake_account_positions_2),
            stake_account_positions_2,
        ),
        IntegrityPoolError::PublisherStakeAccountMismatch,
        0
    );

    // new stake account is delegated
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_3,
        100,
    )
    .unwrap();

    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            Some(stake_account_positions),
            stake_account_positions_3,
        ),
        IntegrityPoolError::NewStakeAccountShouldBeUndelegated,
        0
    );


    // owner can change it
    set_publisher_stake_account(
        &mut svm,
        &payer,
        &payer,
        publisher_keypair.pubkey(),
        Some(stake_account_positions),
        stake_account_positions_2,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.publisher_stake_accounts[publisher_index],
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
    )
    .unwrap();

    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            publisher_keypair.pubkey(),
            Some(stake_account_positions_2),
            stake_account_positions_3,
        ),
        IntegrityPoolError::CurrentStakeAccountShouldBeUndelegated,
        0
    );

    // lastly, if the publisher doesn't exist, fail
    assert_anchor_program_error!(
        set_publisher_stake_account(
            &mut svm,
            &payer,
            &payer,
            Pubkey::new_unique(),
            Some(stake_account_positions),
            stake_account_positions_2,
        ),
        IntegrityPoolError::PublisherNotFound,
        0
    );

    // test the interactions between set_publisher_stake_account and delegate/undelegate
    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 0,
            delta_delegation: 100,
        }
    ); // stake_account_positions_3
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState {
            total_delegation: 0,
            delta_delegation: 90,
        }
    ); // stake_account_positions_2

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    // now the self delegated account undelegates
    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions_2,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        Some(stake_account_positions_2),
    )
    .unwrap();

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_2,
        0,
        1,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 0,
            delta_delegation: 100,
        }
    ); // stake_account_positions_3
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState {
            total_delegation: 0,
            delta_delegation: 89,
        }
    ); // stake_account_positions_2

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    // new epoch
    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions_2,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
        Some(stake_account_positions_2),
    )
    .unwrap();

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions_2,
        0,
        9,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 100,
            delta_delegation: 0,
        }
    ); // stake_account_positions_3
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState {
            total_delegation: 89,
            delta_delegation: -9,
        }
    ); // stake_account_positions_2

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }


    // new epoch
    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 100,
            delta_delegation: 0,
        }
    ); // stake_account_positions_3
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState {
            total_delegation: 80,
            delta_delegation: 0,
        }
    ); // stake_account_positions_2

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }
}
