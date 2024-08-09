use {
    crate::utils::account::fetch_account_data_bytemuck,
    anchor_lang::AccountDeserialize,
    anchor_spl::token::TokenAccount,
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
    },
    staking::{
        error::ErrorCode,
        state::{
            positions::TargetWithParameters,
            stake_account::StakeAccountMetadataV2,
            target::TargetMetadata,
        },
    },
    utils::{
        account::{
            fetch_account_data,
            fetch_positions_account,
        },
        clock::advance_n_epochs,
        error::assert_anchor_program_error,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::{
            create_position::create_position,
            create_stake_account::{
                create_stake_account,
                get_stake_account_metadata_address,
            },
            create_target::get_target_address,
            create_token_account::create_token_account,
            init_config::update_pool_authority,
            slash::slash_staking,
        },
    },
};

pub mod utils;

#[test]
fn test_staking_slash() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey: _,
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
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    let pool_authority = Keypair::new();

    let slash_token_account = create_token_account(&mut svm, &payer, &pyth_token_mint.pubkey());

    update_pool_authority(&mut svm, &payer, pool_authority.pubkey());

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        staking::state::positions::TargetWithParameters::IntegrityPool {
            publisher: publisher_keypair.pubkey(),
        },
        Some(&pool_authority),
        50 * FRAC_64_MULTIPLIER,
    );
    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        staking::state::positions::TargetWithParameters::Voting,
        None,
        10 * FRAC_64_MULTIPLIER,
    );
    svm.expire_blockhash();

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        staking::state::positions::TargetWithParameters::Voting,
        None,
        80 * FRAC_64_MULTIPLIER,
    );


    // initiate delegate at epoch N
    // position will become LOCKED at epoch N+1
    // at epoch N+2, we can slash epoch N+1
    advance_n_epochs(&mut svm, &payer, 2);

    assert_anchor_program_error(
        slash_staking(
            &mut svm,
            &payer,
            stake_account_positions,
            &pool_authority,
            FRAC_64_MULTIPLIER + 1,
            publisher_keypair.pubkey(),
            slash_token_account.pubkey(),
        ),
        ErrorCode::InvalidSlashRatio.into(),
        0,
    );

    slash_staking(
        &mut svm,
        &payer,
        stake_account_positions,
        &pool_authority,
        FRAC_64_MULTIPLIER / 2,
        publisher_keypair.pubkey(),
        slash_token_account.pubkey(),
    )
    .unwrap();

    let mut fixture = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = fixture.to_dynamic_position_array();
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 25 * FRAC_64_MULTIPLIER);
    assert_eq!(
        pos0.target_with_parameters,
        TargetWithParameters::IntegrityPool {
            publisher: publisher_keypair.pubkey(),
        }
    );

    let pos1 = positions.read_position(1).unwrap().unwrap();
    assert_eq!(pos1.amount, 75 * FRAC_64_MULTIPLIER);
    assert_eq!(pos1.target_with_parameters, TargetWithParameters::Voting);

    let slash_account_data = svm.get_account(&slash_token_account.pubkey()).unwrap();
    let slash_account =
        TokenAccount::try_deserialize(&mut slash_account_data.data.as_slice()).unwrap();

    assert_eq!(slash_account.amount, 25 * FRAC_64_MULTIPLIER);

    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let meta_data_account: StakeAccountMetadataV2 =
        fetch_account_data(&mut svm, &stake_account_metadata);

    assert_eq!(meta_data_account.next_index, 2);
    assert!(positions.read_position(2).unwrap().is_none());

    let target_account: TargetMetadata = fetch_account_data(&mut svm, &get_target_address().0);
    assert_eq!(target_account.locked, 75 * FRAC_64_MULTIPLIER);
    assert_eq!(target_account.prev_epoch_locked, 75 * FRAC_64_MULTIPLIER);
    assert_eq!(target_account.delta_locked, 0);
}
