use {
    super::instructions::{
        cast_vote,
        create_proposal,
        sign_off_proposal,
    },
    crate::solana::utils::fetch_governance_account_data,
    litesvm::LiteSVM,
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
    },
    spl_governance::state::proposal::ProposalV2,
};

pub fn create_proposal_and_vote(
    svm: &mut LiteSVM,
    payer: &Keypair,
    stake_account_positions: &Pubkey,
    governance_address: &Pubkey,
) -> ProposalV2 {
    let proposal = create_proposal(svm, payer, *stake_account_positions, governance_address);
    sign_off_proposal(svm, payer, &proposal, governance_address).unwrap();
    cast_vote(
        svm,
        payer,
        *stake_account_positions,
        governance_address,
        &proposal,
    )
    .unwrap();
    fetch_governance_account_data(svm, &proposal)
}
