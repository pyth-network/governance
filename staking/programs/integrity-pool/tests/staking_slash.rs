use {
    crate::utils::account::fetch_account_data_bytemuck,
    anchor_lang::AccountDeserialize,
    anchor_spl::token::TokenAccount,
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
    },
    staking::state::positions::TargetWithParameters,
    utils::{
        clock::advance_n_epochs,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::{
            create_position::create_position,
            create_stake_account::create_stake_account,
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
        40 * FRAC_64_MULTIPLIER,
    );
    svm.expire_blockhash();

    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        staking::state::positions::TargetWithParameters::Voting,
        None,
        40 * FRAC_64_MULTIPLIER,
    );


    // initiate delegate at epoch N
    // position will become LOCKED at epoch N+1
    // at epoch N+2, we can slash epoch N+1
    advance_n_epochs(&mut svm, &payer, 2);

    slash_staking(
        &mut svm,
        &payer,
        stake_account_positions,
        &pool_authority,
        FRAC_64_MULTIPLIER / 2,
        publisher_keypair.pubkey(),
        slash_token_account.pubkey(),
    );

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 25 * FRAC_64_MULTIPLIER);
    assert_eq!(
        pos0.target_with_parameters,
        TargetWithParameters::IntegrityPool {
            publisher: publisher_keypair.pubkey(),
        }
    );

    let pos1 = positions.read_position(1).unwrap().unwrap();
    assert_eq!(pos1.amount, 35 * FRAC_64_MULTIPLIER);
    assert_eq!(pos1.target_with_parameters, TargetWithParameters::Voting);

    let slash_account_data = svm.get_account(&slash_token_account.pubkey()).unwrap();
    let slash_account =
        TokenAccount::try_deserialize(&mut slash_account_data.data.as_slice()).unwrap();

    assert_eq!(slash_account.amount, 25 * FRAC_64_MULTIPLIER);
}
