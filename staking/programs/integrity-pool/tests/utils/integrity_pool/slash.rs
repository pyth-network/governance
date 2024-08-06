use {
    super::pool_data::get_pool_config_address,
    anchor_lang::{
        system_program,
        InstructionData,
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

pub fn get_slash_event_address(index: u8) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[SLASH_EVENT.as_bytes(), &[index]], &integrity_pool::ID)
}

pub fn create_slash_event(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    reward_program_authority: &Keypair,
    index: u8,
    slash_ratio: frac64,
    slash_custody: Pubkey,
    publisher: Pubkey,
) -> TransactionResult {
    let create_slash_event_data = integrity_pool::instruction::CreateSlashEvent {
        index,
        slash_custody,
        slash_ratio,
        publisher,
    };

    let (pool_config, _) = get_pool_config_address();

    let (slash_event, _) = get_slash_event_address(index);

    let create_slash_event_accs = integrity_pool::accounts::CreateSlashEvent {
        payer: payer.pubkey(),
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
