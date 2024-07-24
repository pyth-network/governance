use {
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
    utils::{
        account::{
            fetch_account_data,
            fetch_account_data_bytemuck,
        },
        clock::advance_n_epochs,
        error::assert_anchor_program_error,
        integrity_pool::{
            advance::advance,
            delegate::{
                advance_delegation_record,
                delegate,
                get_delegation_record_address,
                undelegate,
            },
            pool_data::get_pool_config_address,
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
fn test_delegate() {
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

    let (pool_config, _) = get_pool_config_address();
    let target_with_parameters = TargetWithParameters::IntegrityPool {
        pool_authority: pool_config,
        publisher:      publisher_keypair.pubkey(),
    };

    let stake_account_positions =
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        100,
    );

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 100);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 100,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.prev_del_state[0], DelegationState::default());
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    let pos1 = positions.read_position(1).unwrap();
    assert!(pos1.is_none());

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    let delegation_record: DelegationRecord = fetch_account_data(
        &mut svm,
        &get_delegation_record_address(publisher_keypair.pubkey(), stake_account_positions).0,
    );
    assert_eq!(delegation_record.last_epoch, 2);

    let fake_publisher = Pubkey::new_unique();
    assert_anchor_program_error(
        advance_delegation_record(
            &mut svm,
            &payer,
            fake_publisher,
            stake_account_positions,
            pyth_token_mint.pubkey(),
            pool_data_pubkey,
        ),
        anchor_lang::error::Error::from(IntegrityPoolError::PublisherNotFound),
        0,
    );

    assert_anchor_program_error(
        undelegate(
            &mut svm,
            &payer,
            fake_publisher,
            pool_data_pubkey,
            stake_account_positions,
            0,
            50,
        ),
        anchor_lang::error::ErrorCode::AccountNotInitialized.into(),
        0,
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

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 50);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    let pos1 = positions.read_position(1).unwrap();
    assert!(pos1.is_none());

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 50,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.prev_del_state[0], DelegationState::default());
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    advance_n_epochs(&mut svm, &payer, 1);

    assert_anchor_program_error(
        undelegate(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            pool_data_pubkey,
            stake_account_positions,
            0,
            10,
        ),
        anchor_lang::error::Error::from(IntegrityPoolError::OutdatedDelegatorAccounting),
        0,
    );

    svm.expire_blockhash();
    assert_anchor_program_error(
        advance_delegation_record(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            stake_account_positions,
            pyth_token_mint.pubkey(),
            pool_data_pubkey,
        ),
        anchor_lang::error::Error::from(IntegrityPoolError::OutdatedPublisherAccounting),
        0,
    );

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          50,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 50,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    svm.expire_blockhash();
    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    let delegation_record: DelegationRecord = fetch_account_data(
        &mut svm,
        &get_delegation_record_address(publisher_keypair.pubkey(), stake_account_positions).0,
    );
    assert_eq!(delegation_record.last_epoch, 3);

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

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
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
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          50,
            positive_delta_delegation: 0,
            negative_delta_delegation: 30,
        }
    );
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          0,
            positive_delta_delegation: 50,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    advance_n_epochs(&mut svm, &payer, 2); // two epochs at a time
    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();


    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          20,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          20,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();


    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        1,
        30,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
    assert_eq!(
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          20,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          20,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 20);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, None);

    let pos1 = positions.read_position(1).unwrap();
    assert!(pos1.is_none());

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
        pool_data.del_state[0],
        DelegationState {
            total_delegation:          20,
            positive_delta_delegation: 0,
            negative_delta_delegation: 20,
        }
    );
    assert_eq!(
        pool_data.prev_del_state[0],
        DelegationState {
            total_delegation:          20,
            positive_delta_delegation: 0,
            negative_delta_delegation: 0,
        }
    );
    assert_eq!(pool_data.self_del_state[0], DelegationState::default());
    assert_eq!(pool_data.prev_self_del_state[0], DelegationState::default());

    for i in 1..MAX_PUBLISHERS {
        assert_eq!(pool_data.del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_del_state[i], DelegationState::default());
        assert_eq!(pool_data.self_del_state[i], DelegationState::default());
        assert_eq!(pool_data.prev_self_del_state[i], DelegationState::default());
    }

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 20);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, 3);
    assert_eq!(pos0.unlocking_start, Some(6));

    let pos1 = positions.read_position(1).unwrap();
    assert!(pos1.is_none());
}
