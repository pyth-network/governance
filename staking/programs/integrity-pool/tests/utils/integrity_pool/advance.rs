use {
    super::reward_program::get_pool_reward_custody_address,
    crate::utils::{
        account::fetch_account_data,
        integrity_pool::pool_data::get_pool_config_address,
    },
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::state::pool::PoolConfig,
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
};


pub fn advance(
    svm: &mut LiteSVM,
    payer: &Keypair,
    publisher_caps: Pubkey,
    pyth_token_mint: Pubkey,
) -> TransactionResult {
    let (pool_config, _) = get_pool_config_address();
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
