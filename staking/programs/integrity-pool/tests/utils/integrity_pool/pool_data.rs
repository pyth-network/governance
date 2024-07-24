use {
    anchor_lang::{
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::{
        state::pool::PoolData,
        utils::constants::POOL_CONFIG,
    },
    litesvm::types::TransactionResult,
    solana_program::{
        pubkey::Pubkey,
        system_instruction::create_account,
    },
    solana_sdk::{
        instruction::Instruction,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    std::convert::TryInto,
};

pub fn get_pool_config_address() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[POOL_CONFIG.as_bytes()], &integrity_pool::ID)
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
        y: 10,
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
