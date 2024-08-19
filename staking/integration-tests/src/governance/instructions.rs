use {
    crate::{
        solana::utils::fetch_account_data,
        staking::{instructions::get_update_voter_weight_instruction, pda::{get_config_address, get_voter_record_address}},
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
        state::{proposal::VoteType, token_owner_record::get_token_owner_record_address},
    },
    staking::state::{global_config::GlobalConfig, voter_weight_record::VoterWeightAction},
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
    stake_account_positions : Pubkey,
    governance: &Pubkey,
) -> TransactionResult {

    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let realm = &config_data.pyth_governance_realm;
    let program_id = &config_data.governance_program;
    let pyth_mint = &config_data.pyth_token_mint;
    let token_owner_record = get_token_owner_record_address(&program_id, &realm, &pyth_mint, &payer.pubkey());

    let voter_weight_record = get_voter_record_address(stake_account_positions);

    let ix = create_proposal(
        program_id,
        governance,
        &token_owner_record,
        &payer.pubkey(),
        &payer.pubkey(),
        Some(voter_weight_record),
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
        &[get_update_voter_weight_instruction(payer.pubkey(), stake_account_positions, VoterWeightAction::CreateProposal, Some(*governance)), ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}
