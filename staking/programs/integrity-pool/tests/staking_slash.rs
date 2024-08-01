use {
    crate::utils::account::fetch_account_data_bytemuck,
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
    solana_sdk::{
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        signer::Signer,
        transaction::Transaction,
    },
    staking::state::positions::{
        Target,
        TargetWithParameters,
    },
    utils::{
        clock::advance_n_epochs,
        integrity_pool::{
            delegate::delegate,
            pool_data::get_pool_config_address,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::{
            create_stake_account::{
                create_stake_account,
                get_stake_account_custody_address,
                get_stake_account_metadata_address,
            },
            create_target::get_target_address,
            init_config::get_config_address,
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
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);
    let (config_pubkey, _) = get_config_address();
    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);
    let (pool_config, _) = get_pool_config_address();

    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        50 * FRAC_64_MULTIPLIER,
    );

    let create_position_data = staking::instruction::CreatePosition {
        target_with_parameters: staking::state::positions::TargetWithParameters::Voting,
        amount:                 40 * FRAC_64_MULTIPLIER,
    };

    let (target_account, _) = get_target_address(Target::Voting);

    let create_position_accs = staking::accounts::CreatePosition {
        config: config_pubkey,
        stake_account_metadata,
        stake_account_positions,
        stake_account_custody,
        owner: payer.pubkey(),
        target_account,
        pool_authority: None,
    };

    let create_position_ix = Instruction::new_with_bytes(
        staking::ID,
        &create_position_data.data(),
        create_position_accs.to_account_metas(None),
    );

    let create_position_tx = Transaction::new_signed_with_payer(
        &[create_position_ix.clone(), create_position_ix.clone()],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_position_tx).unwrap();

    // initiate delegate at epoch N
    // position will become LOCKED at epoch N+1
    // at epoch N+2, we can slash epoch N+1
    advance_n_epochs(&mut svm, &payer, 2);

    let slash_account_data = staking::instruction::SlashAccount {
        slash_ratio:            FRAC_64_MULTIPLIER / 2,
        target_with_parameters: staking::state::positions::TargetWithParameters::IntegrityPool {
            pool_authority: pool_config,
            publisher:      publisher_keypair.pubkey(),
        },
    };

    let (target_account, _) = get_target_address(Target::Voting);

    let slash_account_accs = staking::accounts::SlashAccount {
        config: config_pubkey,
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        pool_authority: pool_config,
        governance_target_account: target_account,
    };

    let slash_account_ix = Instruction::new_with_bytes(
        staking::ID,
        &slash_account_data.data(),
        slash_account_accs.to_account_metas(None),
    );

    let slash_account_tx = Transaction::new_signed_with_payer(
        &[
            slash_account_ix,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(slash_account_tx).unwrap();

    let positions: staking::state::positions::PositionData =
        fetch_account_data_bytemuck(&mut svm, &stake_account_positions);
    let pos0 = positions.read_position(0).unwrap().unwrap();

    assert_eq!(pos0.amount, 25 * FRAC_64_MULTIPLIER);
    assert_eq!(
        pos0.target_with_parameters,
        TargetWithParameters::IntegrityPool {
            pool_authority: pool_config,
            publisher:      publisher_keypair.pubkey(),
        }
    );

    let pos1 = positions.read_position(1).unwrap().unwrap();
    assert_eq!(pos1.amount, 35 * FRAC_64_MULTIPLIER);
    assert_eq!(pos1.target_with_parameters, TargetWithParameters::Voting);
}
