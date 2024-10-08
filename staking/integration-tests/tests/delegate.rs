use {
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::{
            instructions::{
                advance,
                advance_delegation_record,
                delegate,
                merge_delegation_positions,
                undelegate,
            },
            pda::get_delegation_record_address,
        },
        publisher_caps::helper_functions::post_dummy_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::{
            fetch_account_data,
            fetch_account_data_bytemuck,
            fetch_positions_account,
        },
        staking::helper_functions::initialize_new_stake_account,
        utils::clock::advance_n_epochs,
    },
    integrity_pool::{
        error::IntegrityPoolError,
        state::{
            delegation_record::DelegationRecord,
            pool::{
                DelegationState,
                PoolData,
            },
        },
        utils::constants::MAX_PUBLISHERS,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signer::Signer,
    },
    staking::state::positions::TargetWithParameters,
};


#[test]
fn test_delegate() {
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

    let target_with_parameters = TargetWithParameters::IntegrityPool {
        publisher: publisher_keypair.pubkey(),
    };

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    assert_anchor_program_error!(
        delegate(
            &mut svm,
            &payer,
            Pubkey::default(), // can't delegate to zero pubkey
            pool_data_pubkey,
            stake_account_positions,
            100,
        ),
        IntegrityPoolError::InvalidPublisher,
        0
    );


    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        100,
    )
    .unwrap();

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 100);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);

    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 0,
            delta_delegation: 100,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    assert_eq!(
        positions.read_position(1).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

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

    let delegation_record: DelegationRecord = fetch_account_data(
        &mut svm,
        &get_delegation_record_address(publisher_keypair.pubkey(), stake_account_positions),
    );
    assert_eq!(delegation_record.last_epoch, 2);

    let fake_publisher = Pubkey::new_unique();
    assert_anchor_program_error!(
        advance_delegation_record(
            &mut svm,
            &payer,
            fake_publisher,
            stake_account_positions,
            pyth_token_mint.pubkey(),
            pool_data_pubkey,
            None,
        ),
        IntegrityPoolError::PublisherNotFound,
        0
    );

    assert_anchor_program_error!(
        undelegate(
            &mut svm,
            &payer,
            fake_publisher,
            pool_data_pubkey,
            stake_account_positions,
            0,
            50,
        ),
        IntegrityPoolError::PublisherNotFound,
        0
    );

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        0,
        50,
    )
    .unwrap();

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 50);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    assert_eq!(
        positions.read_position(1).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 0,
            delta_delegation: 50,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    advance_n_epochs(&mut svm, &payer, 1);

    svm.expire_blockhash();
    assert_anchor_program_error!(
        advance_delegation_record(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            stake_account_positions,
            pyth_token_mint.pubkey(),
            pool_data_pubkey,
            None,
        ),
        IntegrityPoolError::OutdatedPublisherAccounting,
        0
    );

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 50,
            delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        0,
        30,
    )
    .unwrap();

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 20);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    let pos1 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(pos1.amount, 30);
    assert_eq!(pos1.target_with_parameters, target_with_parameters);
    assert_eq!(pos1.activation_epoch, 3);
    assert_eq!(pos1.unlocking_start, Some(4));

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 50,
            delta_delegation: -30,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );


    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    advance_n_epochs(&mut svm, &payer, 2); // two epochs at a time
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();


    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 20,
            delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
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

    merge_delegation_positions(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 20,
            delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 20);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    assert_eq!(
        positions.read_position(1).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        0,
        20,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 20,
            delta_delegation: -20,
        }
    );
    assert_eq!(
        pool_data.self_del_state[publisher_index],
        DelegationState::default()
    );

    for i in 0..MAX_PUBLISHERS {
        if i == publisher_index {
            continue;
        }
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
    }

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 20);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, Some(6));

    assert_eq!(
        positions.read_position(1).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );
}
