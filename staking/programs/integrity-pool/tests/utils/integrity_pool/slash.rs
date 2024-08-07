use {
    super::{
        delegate::get_delegation_record_address,
        pool_data::get_pool_config_address,
    },
    crate::utils::staking::{
        create_stake_account::{
            get_stake_account_custody_address,
            get_stake_account_custory_authority_address,
            get_stake_account_metadata_address,
        },
        create_target::get_target_address,
        init_config::get_config_address,
    },
    anchor_lang::{
        system_program,
        InstructionData,
        Key,
        ToAccountMetas,
    },
    integrity_pool::utils::{
        constants::SLASH_EVENT,
        types::frac64,
    },
    litesvm::types::TransactionResult,
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};

pub fn get_slash_event_address(index: u64, publisher: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            SLASH_EVENT.as_bytes(),
            publisher.key().as_ref(),
            &index.to_be_bytes(),
        ],
        &integrity_pool::ID,
    )
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

    let (pool_config, _) = get_pool_config_address();
    let (slash_event, _) = get_slash_event_address(index, publisher);

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

    let (pool_config, _) = get_pool_config_address();
    let (slash_event, _) = get_slash_event_address(index, publisher);
    let (delegation_record, _) = get_delegation_record_address(publisher, stake_account_positions);
    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);
    let (custody_authority, _) =
        get_stake_account_custory_authority_address(stake_account_positions);
    let (config, _) = get_config_address();
    let (target_account, _) = get_target_address();

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
