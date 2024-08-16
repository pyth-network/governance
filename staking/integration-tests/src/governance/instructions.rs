use {
    crate::{
        solana::utils::fetch_account_data,
        staking::pda::get_config_address,
    },
    litesvm::types::TransactionResult,
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    spl_governance::{
        instruction::{
            create_proposal,
            create_token_owner_record,
        },
        state::proposal::VoteType,
    },
    staking::state::global_config::GlobalConfig,
};

pub fn create_governance_record(svm: &mut litesvm::LiteSVM, payer: &Keypair) -> TransactionResult {
    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let realm = &config_data.pyth_governance_realm;
    let program_id = &config_data.governance_program;
    let pyth_mint = &config_data.pyth_token_mint;

    let ix = create_token_owner_record(
        program_id,
        realm,
        &payer.pubkey(),
        pyth_mint,
        &payer.pubkey(),
    );

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}

pub fn create_governance_proposal(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    governance: &Pubkey,
) {
    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let realm = &config_data.pyth_governance_realm;
    let program_id = &config_data.governance_program;
    let pyth_mint = &config_data.pyth_token_mint;

    let ix = create_proposal(
        program_id,
        governance,
        &Pubkey::new_unique(),
        &payer.pubkey(),
        &payer.pubkey(),
        None,
        realm,
        "name".to_string(),
        "description_link".to_string(),
        pyth_mint,
        VoteType::SingleChoice,
        vec!["yes".to_string()],
        true,
        &Pubkey::new_unique(),
    );

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).unwrap();
}
