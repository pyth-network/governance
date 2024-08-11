use {
    super::pda::{
        get_delegation_record_address,
        get_pool_config_address,
        get_pool_reward_custody_address,
        get_slash_event_address,
    },
    crate::{
        solana::utils::fetch_account_data,
        staking::pda::{
            get_config_address,
            get_stake_account_custody_address,
            get_stake_account_custory_authority_address,
            get_stake_account_metadata_address,
            get_target_address,
        },
        utils::constants::YIELD,
    },
    anchor_lang::{
        solana_program::system_instruction::create_account,
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    anchor_spl::token::spl_token,
    integrity_pool::{
        state::pool::{
            PoolConfig,
            PoolData,
        },
        utils::types::frac64,
    },
    litesvm::{
        types::TransactionResult,
        LiteSVM,
    },
    solana_sdk::{
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    std::convert::TryInto,
};


pub fn advance(
    svm: &mut LiteSVM,
    payer: &Keypair,
    publisher_caps: Pubkey,
    pyth_token_mint: Pubkey,
) -> TransactionResult {
    let pool_config = get_pool_config_address();
    let pool_data = fetch_account_data::<PoolConfig>(svm, &pool_config).pool_data;
    let pool_reward_custody = get_pool_reward_custody_address(pyth_token_mint);

    let accounts = integrity_pool::accounts::Advance {
        signer: payer.pubkey(),
        pool_config,
        pool_reward_custody,
        publisher_caps,
        pool_data,
    };

    let instruction_data = integrity_pool::instruction::Advance {};

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    let transaction = Transaction::new_signed_with_payer(
        &[
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(transaction)
}

pub fn create_pool_data_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pool_data_keypair: &Keypair,
    reward_program_authority: Pubkey,
    pyth_token_mint: Pubkey,
) -> TransactionResult {
    let pool_data_space: u64 = PoolData::LEN.try_into().unwrap();

    let rent = svm.minimum_balance_for_rent_exemption(pool_data_space.try_into().unwrap());

    let create_pool_data_acc_ix = create_account(
        &payer.pubkey(),
        &pool_data_keypair.pubkey(),
        rent,
        pool_data_space,
        &integrity_pool::ID,
    );

    let pool_config_pubkey = get_pool_config_address();

    let initialize_pool_data = integrity_pool::instruction::InitializePool {
        pyth_token_mint,
        reward_program_authority,
        y: YIELD,
    };

    let initialize_pool_accs = integrity_pool::accounts::InitializePool {
        payer:          payer.pubkey(),
        pool_data:      pool_data_keypair.pubkey(),
        pool_config:    pool_config_pubkey,
        system_program: system_program::ID,
    };

    let initialize_pool_ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &initialize_pool_data.data(),
        initialize_pool_accs.to_account_metas(None),
    );

    let initialize_pool_tx = Transaction::new_signed_with_payer(
        &[create_pool_data_acc_ix, initialize_pool_ix],
        Some(&payer.pubkey()),
        &[payer, pool_data_keypair],
        svm.latest_blockhash(),
    );

    svm.send_transaction(initialize_pool_tx.clone())
}

pub fn advance_delegation_record(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    publisher: Pubkey,
    stake_account_positions: Pubkey,
    pyth_token_mint: Pubkey,
    pool_data: Pubkey,
) -> TransactionResult {
    let delegation_record = get_delegation_record_address(publisher, stake_account_positions);
    let custody_addess = get_pool_reward_custody_address(pyth_token_mint);
    let pool_config_pubkey = get_pool_config_address();
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let data = integrity_pool::instruction::AdvanceDelegationRecord {};

    let accs = integrity_pool::accounts::AdvanceDelegationRecord {
        payer: payer.pubkey(),
        pool_config: pool_config_pubkey,
        pool_reward_custody: custody_addess,
        pool_data,
        stake_account_custody,
        publisher,
        delegation_record,
        stake_account_positions,
        token_program: spl_token::ID,
        system_program: system_program::ID,
    };
    let ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &data.data(),
        accs.to_account_metas(None),
    );
    let tx = Transaction::new_signed_with_payer(
        &[
            ix,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(tx)
}

pub fn delegate(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    publisher: Pubkey,
    pool_data: Pubkey,
    stake_account_positions: Pubkey,
    amount: u64,
) {
    let pool_config_pubkey = get_pool_config_address();
    let config_account = get_config_address();
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let delegate_data = integrity_pool::instruction::Delegate { amount };
    let delegate_accs = integrity_pool::accounts::Delegate {
        payer: payer.pubkey(),
        pool_data,
        pool_config: pool_config_pubkey,
        publisher,
        config_account,
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        staking_program: staking::ID,
    };

    let delegate_ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &delegate_data.data(),
        delegate_accs.to_account_metas(None),
    );

    let delegate_tx = Transaction::new_signed_with_payer(
        &[delegate_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(delegate_tx).unwrap();
}

pub fn undelegate(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    publisher: Pubkey,
    pool_data: Pubkey,
    stake_account_positions: Pubkey,
    position_index: u8,
    amount: u64,
) -> TransactionResult {
    let delegation_record = get_delegation_record_address(publisher, stake_account_positions);
    let pool_config_pubkey = get_pool_config_address();
    let config_account = get_config_address();
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let undelegate_data = integrity_pool::instruction::Undelegate {
        position_index,
        amount,
    };
    let undelegate_accs = integrity_pool::accounts::Undelegate {
        payer: payer.pubkey(),
        pool_data,
        pool_config: pool_config_pubkey,
        publisher,
        delegation_record,
        config_account,
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        staking_program: staking::ID,
    };
    let undelegate_ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &undelegate_data.data(),
        undelegate_accs.to_account_metas(None),
    );
    let undelegate_tx = Transaction::new_signed_with_payer(
        &[undelegate_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(undelegate_tx)
}

pub fn set_publisher_stake_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    signer: &Keypair,
    publisher: Pubkey,
    current_stake_account_positions_option: Option<Pubkey>,
    new_stake_account_positions: Pubkey,
) -> TransactionResult {
    let pool_config = get_pool_config_address();
    let pool_data: Pubkey = fetch_account_data::<PoolConfig>(svm, &pool_config).pool_data;

    let data = integrity_pool::instruction::SetPublisherStakeAccount {};
    let accs = integrity_pool::accounts::SetPublisherStakeAccount {
        signer: signer.pubkey(),
        publisher,
        pool_data,
        current_stake_account_positions_option,
        new_stake_account_positions,
        pool_config,
    };

    let ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &data.data(),
        accs.to_account_metas(None),
    );

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer, &signer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}

pub fn create_slash_event(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    reward_program_authority: &Keypair,
    index: u64,
    slash_ratio: frac64,
    slash_custody: Pubkey,
    publisher: Pubkey,
    pool_data: Pubkey,
) -> TransactionResult {
    let create_slash_event_data = integrity_pool::instruction::CreateSlashEvent {
        index,
        slash_ratio,
        publisher,
    };

    let pool_config = get_pool_config_address();
    let slash_event = get_slash_event_address(index, publisher);

    let create_slash_event_accs = integrity_pool::accounts::CreateSlashEvent {
        payer: payer.pubkey(),
        pool_data,
        slash_custody,
        reward_program_authority: reward_program_authority.pubkey(),
        pool_config,
        slash_event,
        system_program: system_program::ID,
    };

    let create_slash_event_ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &create_slash_event_data.data(),
        create_slash_event_accs.to_account_metas(None),
    );

    let create_slash_event_tx = Transaction::new_signed_with_payer(
        &[create_slash_event_ix],
        Some(&payer.pubkey()),
        &[payer, reward_program_authority],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_slash_event_tx)
}

pub fn slash(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    index: u64,
    slash_custody: Pubkey,
    publisher: Pubkey,
    pool_data: Pubkey,
) -> TransactionResult {
    let slash_data = integrity_pool::instruction::Slash { index };

    let pool_config = get_pool_config_address();
    let slash_event = get_slash_event_address(index, publisher);
    let delegation_record = get_delegation_record_address(publisher, stake_account_positions);
    let stake_account_metadata = get_stake_account_metadata_address(stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);
    let custody_authority = get_stake_account_custory_authority_address(stake_account_positions);
    let config = get_config_address();
    let target_account = get_target_address();

    let slash_accs = integrity_pool::accounts::Slash {
        delegation_record,
        publisher,
        config_account: config,
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        custody_authority,
        governance_target_account: target_account,
        signer: payer.pubkey(),
        pool_data,
        slash_custody,
        pool_config,
        slash_event,
        staking_program: staking::ID,
        token_program: spl_token::ID,
    };

    let slash_ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &slash_data.data(),
        slash_accs.to_account_metas(None),
    );

    let slash_tx = Transaction::new_signed_with_payer(
        &[slash_ix],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(slash_tx)
}
