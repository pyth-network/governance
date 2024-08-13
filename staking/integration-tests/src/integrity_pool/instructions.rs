use {
    super::pda::{
        get_pool_config_address,
        get_pool_reward_custody_address,
    },
    crate::utils::{
        account::fetch_account_data,
        constants::YIELD,
    },
    anchor_lang::{
        solana_program::system_instruction::create_account,
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::state::pool::{
        PoolConfig,
        PoolData,
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

    let (pool_config_pubkey, _) = get_pool_config_address();

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
