use {
    super::{
        super::staking::{
            create_stake_account::{
                get_stake_account_custody_address,
                get_stake_account_metadata_address,
            },
            init_config::get_config_address,
        },
        pool_data::get_pool_config_address,
        reward_program::get_pool_reward_custody_address,
    },
    anchor_lang::{
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::utils::constants::DELEGATION_RECORD,
    litesvm::types::TransactionResult,
    solana_sdk::{
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};

pub fn get_delegation_record_address(
    publisher: Pubkey,
    stake_account_positions: Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            DELEGATION_RECORD.as_bytes(),
            publisher.as_ref(),
            stake_account_positions.as_ref(),
        ],
        &integrity_pool::ID,
    )
}

pub fn advance_delegation_record(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    publisher: Pubkey,
    stake_account_positions: Pubkey,
    pyth_token_mint: Pubkey,
    pool_data: Pubkey,
) -> TransactionResult {
    let (delegation_record, _) = get_delegation_record_address(publisher, stake_account_positions);
    let custody_addess = get_pool_reward_custody_address(pyth_token_mint);
    let (pool_config_pubkey, _) = get_pool_config_address();
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);

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
    let (pool_config_pubkey, _) = get_pool_config_address();
    let (config_account, _) = get_config_address();
    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);

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
    let (delegation_record, _) = get_delegation_record_address(publisher, stake_account_positions);
    let (pool_config_pubkey, _) = get_pool_config_address();
    let (config_account, _) = get_config_address();
    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);

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
