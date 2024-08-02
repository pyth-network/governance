use {
    crate::utils::integrity_pool::pool_data::get_pool_config_address,
    anchor_lang::{
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::utils::clock::{
        EPOCH_DURATION,
        UNLOCKING_DURATION,
    },
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    staking::state::global_config::GlobalConfig,
};

pub fn get_config_address() -> (Pubkey, u8) {
    Pubkey::find_program_address(&["config".as_bytes()], &staking::ID)
}

pub fn init_config_account(svm: &mut litesvm::LiteSVM, payer: &Keypair, pyth_token_mint: Pubkey) {
    let (pool_config, _) = get_pool_config_address();
    let (config_account, config_bump) = get_config_address();

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
