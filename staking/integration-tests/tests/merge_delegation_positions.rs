use {
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::instructions::{
            advance,
            advance_delegation_record,
            delegate,
            merge_delegation_positions,
            undelegate,
        },
        publisher_caps::helper_functions::post_dummy_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::utils::fetch_positions_account,
        staking::{
            helper_functions::initialize_new_stake_account,
            instructions::create_position,
        },
        utils::clock::advance_n_epochs,
    },
    integrity_pool::error::IntegrityPoolError,
    solana_sdk::{
        native_token::LAMPORTS_PER_SOL,
        pubkey::Pubkey,
        rent::Rent,
        signature::Keypair,
        signer::Signer,
    },
    staking::state::positions::{
        TargetWithParameters,
        POSITION_BUFFER_SIZE,
    },
};


#[test]
fn test_merge_delegation_positions() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let target_with_parameters = TargetWithParameters::IntegrityPool {
        publisher: publisher_keypair.pubkey(),
    };

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);


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

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        1,
    )
    .unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        2,
    )
    .unwrap();

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        TargetWithParameters::Voting,
        None,
        3,
    )
    .unwrap();

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 1);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos0.unlocking_start, None);

    let pos1 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(pos1.amount, 2);
    assert_eq!(pos1.target_with_parameters, target_with_parameters);
    assert_eq!(pos1.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos1.unlocking_start, None);


    let pos2 = positions.read_position(2).unwrap().unwrap();

    assert_eq!(pos2.amount, 3);
    assert_eq!(pos2.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos2.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos2.unlocking_start, None);


    assert_eq!(
        positions.read_position(3).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );


    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    assert_anchor_program_error!(
        merge_delegation_positions(
            &mut svm,
            &payer,
            publisher_keypair.pubkey(),
            pool_data_pubkey,
            stake_account_positions,
        ),
        IntegrityPoolError::OutdatedDelegatorAccounting,
        0
    );

    assert_anchor_program_error!(
        merge_delegation_positions(
            &mut svm,
            &payer,
            Pubkey::new_unique(),
            pool_data_pubkey,
            stake_account_positions,
        ),
        anchor_lang::error::ErrorCode::AccountNotInitialized,
        0
    );

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        4,
    )
    .unwrap();

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        TargetWithParameters::Voting,
        None,
        5,
    )
    .unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        6,
    )
    .unwrap();

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 1);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos0.unlocking_start, None);

    let pos1 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(pos1.amount, 2);
    assert_eq!(pos1.target_with_parameters, target_with_parameters);
    assert_eq!(pos1.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos1.unlocking_start, None);


    let pos2 = positions.read_position(2).unwrap().unwrap();

    assert_eq!(pos2.amount, 3);
    assert_eq!(pos2.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos2.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos2.unlocking_start, None);

    let pos3 = positions.read_position(3).unwrap().unwrap();

    assert_eq!(pos3.amount, 4);
    assert_eq!(pos3.target_with_parameters, target_with_parameters);
    assert_eq!(pos3.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos3.unlocking_start, None);

    let pos4 = positions.read_position(4).unwrap().unwrap();

    assert_eq!(pos4.amount, 5);
    assert_eq!(pos4.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos4.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos4.unlocking_start, None);

    let pos5 = positions.read_position(5).unwrap().unwrap();

    assert_eq!(pos5.amount, 6);
    assert_eq!(pos5.target_with_parameters, target_with_parameters);
    assert_eq!(pos5.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos5.unlocking_start, None);

    assert_eq!(
        positions.read_position(6).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps).unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        7,
    )
    .unwrap();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        8,
    )
    .unwrap();

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
        1,
    )
    .unwrap();

    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        3,
        1,
    )
    .unwrap();


    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 1);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos0.unlocking_start, Some(STARTING_EPOCH + 3));

    let pos1 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(pos1.amount, 2);
    assert_eq!(pos1.target_with_parameters, target_with_parameters);
    assert_eq!(pos1.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos1.unlocking_start, None);


    let pos2 = positions.read_position(2).unwrap().unwrap();

    assert_eq!(pos2.amount, 3);
    assert_eq!(pos2.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos2.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos2.unlocking_start, None);

    let pos3 = positions.read_position(3).unwrap().unwrap();

    assert_eq!(pos3.amount, 3);
    assert_eq!(pos3.target_with_parameters, target_with_parameters);
    assert_eq!(pos3.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos3.unlocking_start, None);

    let pos4 = positions.read_position(4).unwrap().unwrap();

    assert_eq!(pos4.amount, 5);
    assert_eq!(pos4.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos4.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos4.unlocking_start, None);

    let pos5 = positions.read_position(5).unwrap().unwrap();

    assert_eq!(pos5.amount, 6);
    assert_eq!(pos5.target_with_parameters, target_with_parameters);
    assert_eq!(pos5.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos5.unlocking_start, None);


    let pos6 = positions.read_position(6).unwrap().unwrap();

    assert_eq!(pos6.amount, 7);
    assert_eq!(pos6.target_with_parameters, target_with_parameters);
    assert_eq!(pos6.activation_epoch, STARTING_EPOCH + 3);
    assert_eq!(pos6.unlocking_start, None);


    let pos7 = positions.read_position(7).unwrap().unwrap();

    assert_eq!(pos7.amount, 8);
    assert_eq!(pos7.target_with_parameters, target_with_parameters);
    assert_eq!(pos7.activation_epoch, STARTING_EPOCH + 3);
    assert_eq!(pos7.unlocking_start, None);

    let pos8 = positions.read_position(8).unwrap().unwrap();

    assert_eq!(pos8.amount, 1);
    assert_eq!(pos8.target_with_parameters, target_with_parameters);
    assert_eq!(pos8.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos8.unlocking_start, Some(STARTING_EPOCH + 3));

    assert_eq!(
        positions.read_position(9).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

    advance_n_epochs(&mut svm, &payer, 1);
    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
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


    let payer_balance_before = svm.get_balance(&payer.pubkey()).unwrap();

    merge_delegation_positions(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
    )
    .unwrap();

    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 2);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos0.unlocking_start, Some(STARTING_EPOCH + 3));

    let pos1 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(pos1.amount, 11);
    assert_eq!(pos1.target_with_parameters, target_with_parameters);
    assert_eq!(pos1.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos1.unlocking_start, None);


    let pos2 = positions.read_position(2).unwrap().unwrap();

    assert_eq!(pos2.amount, 3);
    assert_eq!(pos2.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos2.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos2.unlocking_start, None);

    let pos3 = positions.read_position(3).unwrap().unwrap();

    assert_eq!(pos3.amount, 15);
    assert_eq!(pos3.target_with_parameters, target_with_parameters);
    assert_eq!(pos3.activation_epoch, STARTING_EPOCH + 3);
    assert_eq!(pos3.unlocking_start, None);

    let pos4 = positions.read_position(4).unwrap().unwrap();

    assert_eq!(pos4.amount, 5);
    assert_eq!(pos4.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos4.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos4.unlocking_start, None);


    assert_eq!(
        positions.read_position(5).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );


    let payer_balance_after = svm.get_balance(&payer.pubkey()).unwrap();
    let balance = svm.get_balance(&stake_account_positions).unwrap();
    let stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);

    assert_eq!(
        payer_balance_before + Rent::default().minimum_balance(40 + 9 * POSITION_BUFFER_SIZE),
        payer_balance_after + Rent::default().minimum_balance(40 + 5 * POSITION_BUFFER_SIZE) + 5000
    );
    assert_eq!(
        balance,
        Rent::default().minimum_balance(40 + 5 * POSITION_BUFFER_SIZE)
    );
    assert_eq!(
        stake_positions_account.data.len(),
        40 + 5 * POSITION_BUFFER_SIZE
    );

    //anyone can call merge_delegation_positions
    let payer_2 = Keypair::new();
    svm.airdrop(&payer_2.pubkey(), LAMPORTS_PER_SOL).unwrap();
    merge_delegation_positions(
        &mut svm,
        &payer_2,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
    )
    .unwrap();

    // account is unchanged
    let mut stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 2);
    assert_eq!(pos0.target_with_parameters, target_with_parameters);
    assert_eq!(pos0.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos0.unlocking_start, Some(STARTING_EPOCH + 3));

    let pos1 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(pos1.amount, 11);
    assert_eq!(pos1.target_with_parameters, target_with_parameters);
    assert_eq!(pos1.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos1.unlocking_start, None);


    let pos2 = positions.read_position(2).unwrap().unwrap();

    assert_eq!(pos2.amount, 3);
    assert_eq!(pos2.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos2.activation_epoch, STARTING_EPOCH + 1);
    assert_eq!(pos2.unlocking_start, None);

    let pos3 = positions.read_position(3).unwrap().unwrap();

    assert_eq!(pos3.amount, 15);
    assert_eq!(pos3.target_with_parameters, target_with_parameters);
    assert_eq!(pos3.activation_epoch, STARTING_EPOCH + 3);
    assert_eq!(pos3.unlocking_start, None);

    let pos4 = positions.read_position(4).unwrap().unwrap();

    assert_eq!(pos4.amount, 5);
    assert_eq!(pos4.target_with_parameters, TargetWithParameters::Voting);
    assert_eq!(pos4.activation_epoch, STARTING_EPOCH + 2);
    assert_eq!(pos4.unlocking_start, None);

    let balance = svm.get_balance(&stake_account_positions).unwrap();
    let stake_positions_account = fetch_positions_account(&mut svm, &stake_account_positions);

    assert_eq!(
        balance,
        Rent::default().minimum_balance(40 + 5 * POSITION_BUFFER_SIZE)
    );
    assert_eq!(
        stake_positions_account.data.len(),
        40 + 5 * POSITION_BUFFER_SIZE
    );
    assert_eq!(
        svm.get_balance(&payer.pubkey()).unwrap(),
        payer_balance_after
    );
}
