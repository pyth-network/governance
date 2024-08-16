use {
    super::pda::{
        get_config_address,
        get_config_address_bump,
        get_stake_account_custody_address,
        get_stake_account_custory_authority_address,
        get_stake_account_metadata_address,
        get_target_address,
        get_voter_record_address,
    },
    crate::{
        integrity_pool::pda::get_pool_config_address,
        solana::utils::fetch_account_data,
    },
    anchor_lang::{
        solana_program,
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    anchor_spl::token::spl_token,
    integrity_pool::utils::{
        clock::{
            EPOCH_DURATION,
            UNLOCKING_DURATION,
        },
        types::frac64,
    },
    litesvm::types::TransactionResult,
    solana_sdk::{
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    staking::state::{
        global_config::GlobalConfig,
        positions::TargetWithParameters,
        voter_weight_record::VoterWeightAction,
    },
};

pub fn init_config_account(svm: &mut litesvm::LiteSVM, payer: &Keypair, pyth_token_mint: Pubkey) {
    let pool_config = get_pool_config_address();
    let config_account = get_config_address();
    let config_bump = get_config_address_bump();

    let init_config_data = staking::instruction::InitConfig {
        global_config: GlobalConfig {
            bump: config_bump,
            governance_authority: payer.pubkey(),
            pyth_token_mint,
            pyth_governance_realm: Pubkey::new_unique(),
            unlocking_duration: UNLOCKING_DURATION,
            epoch_duration: EPOCH_DURATION,
            freeze: false,
            pda_authority: payer.pubkey(),
            governance_program: Pubkey::new_unique(),
            pyth_token_list_time: None,
            agreement_hash: [0; 32],
            mock_clock_time: 30,
            pool_authority: pool_config,
        },
    };
    let init_config_accs = staking::accounts::InitConfig {
        payer: payer.pubkey(),
        config_account,
        rent: solana_program::sysvar::rent::ID,
        system_program: system_program::ID,
    };
    let init_config_ix = Instruction::new_with_bytes(
        staking::ID,
        &init_config_data.data(),
        init_config_accs.to_account_metas(None),
    );
    let init_config_tx = Transaction::new_signed_with_payer(
        &[init_config_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(init_config_tx).unwrap();
}


pub fn update_pool_authority(svm: &mut litesvm::LiteSVM, payer: &Keypair, pool_authority: Pubkey) {
    let config_account = get_config_address();

    let update_pool_authority_data = staking::instruction::UpdatePoolAuthority { pool_authority };
    let update_pool_authority_accs = staking::accounts::UpdatePoolAuthority {
        config:               config_account,
        governance_authority: payer.pubkey(),
    };
    let update_pool_authority_ix = Instruction::new_with_bytes(
        staking::ID,
        &update_pool_authority_data.data(),
        update_pool_authority_accs.to_account_metas(None),
    );
    let update_pool_authority_tx = Transaction::new_signed_with_payer(
        &[update_pool_authority_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(update_pool_authority_tx).unwrap();
}

pub fn create_target_account(svm: &mut litesvm::LiteSVM, payer: &Keypair) {
    let target_account = get_target_address();
    let config_account = get_config_address();

    let target_data = staking::instruction::CreateTarget {};
    let target_accs = staking::accounts::CreateTarget {
        payer: payer.pubkey(),
        governance_authority: payer.pubkey(),
        config: config_account,
        target_account,
        system_program: system_program::ID,
    };
    let target_ix = Instruction::new_with_bytes(
        staking::ID,
        &target_data.data(),
        target_accs.to_account_metas(None),
    );
    let target_tx = Transaction::new_signed_with_payer(
        &[target_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(target_tx).unwrap();
}

pub fn create_position(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    target_with_parameters: TargetWithParameters,
    pool_authority: Option<&Keypair>,
    amount: frac64,
) {
    let config_pubkey = get_config_address();
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let create_position_data = staking::instruction::CreatePosition {
        target_with_parameters,
        amount,
    };

    let target_account = match target_with_parameters {
        TargetWithParameters::Voting => Some(get_target_address()),
        TargetWithParameters::IntegrityPool { .. } => None,
    };

    let create_position_accs = staking::accounts::CreatePosition {
        config: config_pubkey,
        stake_account_metadata,
        stake_account_positions,
        stake_account_custody,
        owner: payer.pubkey(),
        target_account,
        pool_authority: pool_authority.map(|k| k.pubkey()),
        system_program: system_program::ID,
    };

    let create_position_ix = Instruction::new_with_bytes(
        staking::ID,
        &create_position_data.data(),
        create_position_accs.to_account_metas(None),
    );


    let mut signing_keypairs: Vec<&Keypair> = vec![&payer];

    if let Some(pool_authority) = pool_authority {
        signing_keypairs.push(pool_authority);
    }

    let create_position_tx = Transaction::new_signed_with_payer(
        &[create_position_ix],
        Some(&payer.pubkey()),
        signing_keypairs.as_slice(),
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_position_tx).unwrap();
}

pub fn create_stake_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Keypair,
    stake_account_positions: Pubkey,
) -> TransactionResult {
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);
    let custody_authority = get_stake_account_custory_authority_address(stake_account_positions);
    let config_account = get_config_address();

    let create_stake_account_data = staking::instruction::CreateStakeAccount {
        owner: payer.pubkey(),
        lock:  staking::state::vesting::VestingSchedule::FullyVested,
    };
    let create_stake_account_accs = staking::accounts::CreateStakeAccount {
        payer: payer.pubkey(),
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        custody_authority,
        config: config_account,
        pyth_token_mint: pyth_token_mint.pubkey(),
        token_program: spl_token::id(),
        system_program: system_program::ID,
        rent: solana_program::sysvar::rent::ID,
    };
    let create_stake_account_ix = Instruction::new_with_bytes(
        staking::ID,
        &create_stake_account_data.data(),
        create_stake_account_accs.to_account_metas(None),
    );
    let create_stake_account_tx = Transaction::new_signed_with_payer(
        &[create_stake_account_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_stake_account_tx)
}


pub fn join_dao_llc(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
) -> TransactionResult {
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let config_account = get_config_address();

    let config = fetch_account_data::<GlobalConfig>(svm, &config_account);

    let join_dao_llc_data = staking::instruction::JoinDaoLlc {
        _agreement_hash: config.agreement_hash,
    };
    let join_dao_llc_accs = staking::accounts::JoinDaoLlc {
        owner: payer.pubkey(),
        stake_account_positions,
        stake_account_metadata,
        config: config_account,
    };
    let join_dao_llc_ix = Instruction::new_with_bytes(
        staking::ID,
        &join_dao_llc_data.data(),
        join_dao_llc_accs.to_account_metas(None),
    );
    let join_dao_llc_tx = Transaction::new_signed_with_payer(
        &[join_dao_llc_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(join_dao_llc_tx)
}

pub fn slash_staking(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    pool_authority: &Keypair,
    slash_ratio: frac64,
    publisher: Pubkey,
    destination: Pubkey,
) -> TransactionResult {
    let slash_account_data = staking::instruction::SlashAccount { slash_ratio };

    let target_account = get_target_address();
    let config_pubkey = get_config_address();
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);
    let stake_account_authority =
        get_stake_account_custory_authority_address(stake_account_positions);

    let slash_account_accs = staking::accounts::SlashAccount {
        config: config_pubkey,
        publisher,
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        pool_authority: pool_authority.pubkey(),
        governance_target_account: target_account,
        custody_authority: stake_account_authority,
        token_program: spl_token::ID,
        destination,
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
        &[&payer, &pool_authority],
        svm.latest_blockhash(),
    );

    svm.send_transaction(slash_account_tx)
}

pub fn update_voter_weight(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
) -> TransactionResult {
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let config_account = get_config_address();
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);
    let governance_target = get_target_address();
    let voter_record = get_voter_record_address(stake_account_positions);

    let update_voter_weight_data: staking::instruction::UpdateVoterWeight =
        staking::instruction::UpdateVoterWeight {
            action: VoterWeightAction::CreateGovernance,
        };
    let update_voter_weight_accs = staking::accounts::UpdateVoterWeight {
        stake_account_custody,
        governance_target,
        owner: payer.pubkey(),
        stake_account_positions,
        stake_account_metadata,
        config: config_account,
        voter_record,
    };
    let update_voter_weight_ix = Instruction::new_with_bytes(
        staking::ID,
        &update_voter_weight_data.data(),
        update_voter_weight_accs.to_account_metas(None),
    );
    let update_voter_weight_tx = Transaction::new_signed_with_payer(
        &[update_voter_weight_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(update_voter_weight_tx)
}

pub fn update_token_list_time(svm: &mut litesvm::LiteSVM, payer: &Keypair, token_list_time: i64) {
    let config_account = get_config_address();

    let update_token_list_time_data = staking::instruction::UpdateTokenListTime {
        token_list_time: Some(token_list_time),
    };
    let update_token_list_time_accs = staking::accounts::UpdateTokenListTime {
        config:               config_account,
        governance_authority: payer.pubkey(),
    };
    let update_token_list_time_ix = Instruction::new_with_bytes(
        staking::ID,
        &update_token_list_time_data.data(),
        update_token_list_time_accs.to_account_metas(None),
    );
    let update_token_list_time_tx = Transaction::new_signed_with_payer(
        &[update_token_list_time_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(update_token_list_time_tx).unwrap();
}

pub fn merge_target_positions(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
) -> TransactionResult {
    let config_account = get_config_address();
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);

    let data = staking::instruction::MergeTargetPositions {
        target_with_parameters: TargetWithParameters::Voting,
    };

    let accs = staking::accounts::MergeTargetPositions {
        owner: payer.pubkey(),
        stake_account_positions,
        stake_account_metadata,
        pool_authority: None,
        config: config_account,
    };
    let ix = Instruction::new_with_bytes(staking::ID, &data.data(), accs.to_account_metas(None));
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}
