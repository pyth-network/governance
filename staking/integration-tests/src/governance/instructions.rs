use {
    crate::{
        solana::utils::fetch_account_data,
        staking::{
            instructions::get_update_voter_weight_instruction,
            pda::{
                get_config_address,
                get_max_voter_record_address,
                get_voter_record_address,
            },
        },
    },
    litesvm::types::TransactionResult,
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    spl_governance::state::{
        proposal::{
            get_proposal_address,
            VoteType,
        },
        token_owner_record::get_token_owner_record_address,
        vote_record::{
            Vote,
            VoteChoice,
        },
    },
    staking::state::{
        global_config::GlobalConfig,
        voter_weight_record::VoterWeightAction,
    },
};

pub fn create_token_owner_record(svm: &mut litesvm::LiteSVM, payer: &Keypair) -> TransactionResult {
    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let pyth_governance_realm = &config_data.pyth_governance_realm;
    let governance_program = &config_data.governance_program;
    let pyth_token_mint = &config_data.pyth_token_mint;

    let ix = spl_governance::instruction::create_token_owner_record(
        governance_program,
        pyth_governance_realm,
        &payer.pubkey(),
        pyth_token_mint,
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

pub fn create_proposal(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    governance: &Pubkey,
) -> Pubkey {
    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let pyth_governance_realm = &config_data.pyth_governance_realm;
    let program_id = &config_data.governance_program;
    let pyth_mint = &config_data.pyth_token_mint;
    let token_owner_record = get_token_owner_record_address(
        program_id,
        pyth_governance_realm,
        pyth_mint,
        &payer.pubkey(),
    );

    let voter_weight_record = get_voter_record_address(stake_account_positions);

    let proposal_seed = Pubkey::new_unique();
    let proposal_address = get_proposal_address(program_id, governance, pyth_mint, &proposal_seed);

    let ix = spl_governance::instruction::create_proposal(
        program_id,
        governance,
        &token_owner_record,
        &payer.pubkey(),
        &payer.pubkey(),
        Some(voter_weight_record),
        pyth_governance_realm,
        "name".to_string(),
        "description_link".to_string(),
        pyth_mint,
        VoteType::SingleChoice,
        vec!["yes".to_string()],
        true,
        &proposal_seed,
    );

    let tx = Transaction::new_signed_with_payer(
        &[
            get_update_voter_weight_instruction(
                payer.pubkey(),
                stake_account_positions,
                VoterWeightAction::CreateProposal,
                Some(*governance),
            ),
            ix,
        ],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).unwrap();
    proposal_address
}

pub fn sign_off_proposal(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    proposal: &Pubkey,
    governance: &Pubkey,
) -> TransactionResult {
    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let pyth_governance_realm = &config_data.pyth_governance_realm;
    let program_id = &config_data.governance_program;
    let pyth_mint = &config_data.pyth_token_mint;
    let token_owner_record = get_token_owner_record_address(
        program_id,
        pyth_governance_realm,
        pyth_mint,
        &payer.pubkey(),
    );

    let ix = spl_governance::instruction::sign_off_proposal(
        program_id,
        pyth_governance_realm,
        governance,
        proposal,
        &payer.pubkey(),
        Some(&token_owner_record),
    );

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}


pub fn cast_vote(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    governance: &Pubkey,
    proposal: &Pubkey,
) -> TransactionResult {
    let config = get_config_address();

    let config_data: GlobalConfig = fetch_account_data(svm, &config);
    let governance_realm = &config_data.pyth_governance_realm;
    let govenance_program = &config_data.governance_program;
    let pyth_token_mint = &config_data.pyth_token_mint;
    let token_owner_record = get_token_owner_record_address(
        govenance_program,
        governance_realm,
        pyth_token_mint,
        &payer.pubkey(),
    );

    let voter_weight_record = get_voter_record_address(stake_account_positions);
    let max_voter_weight_record = get_max_voter_record_address();

    let ix = spl_governance::instruction::cast_vote(
        govenance_program,
        governance_realm,
        governance,
        proposal,
        &token_owner_record,
        &token_owner_record,
        &payer.pubkey(),
        pyth_token_mint,
        &payer.pubkey(),
        Some(voter_weight_record),
        Some(max_voter_weight_record),
        Vote::Approve(vec![VoteChoice {
            rank:              0,
            weight_percentage: 100,
        }]),
    );

    let tx = Transaction::new_signed_with_payer(
        &[
            get_update_voter_weight_instruction(
                payer.pubkey(),
                stake_account_positions,
                VoterWeightAction::CastVote,
                Some(*proposal),
            ),
            ix,
        ],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}
