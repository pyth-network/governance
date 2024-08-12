use {
    super::pda::{
        get_config_address,
        get_target_address,
    },
    crate::integrity_pool::pda::get_pool_config_address,
    anchor_lang::{
        solana_program,
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


pub fn update_pool_authority(svm: &mut litesvm::LiteSVM, payer: &Keypair, pool_authority: Pubkey) {
    let (config_account, _) = get_config_address();

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
    let (target_account, _) = get_target_address();
    let (config_account, _) = get_config_address();

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
