use {
    super::{
        create_stake_account::{
            get_stake_account_custody_address,
            get_stake_account_custory_authority_address,
            get_stake_account_metadata_address,
        },
        create_target::get_target_address,
        init_config::get_config_address,
    },
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    common_utils::frac64::frac64,
    litesvm::types::TransactionResult,
    solana_sdk::{
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};


pub fn slash_staking(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    pool_authority: &Keypair,
    slash_ratio: frac64,
    publisher: Pubkey,
    destination: Pubkey,
) -> TransactionResult {
    let slash_account_data = staking::instruction::SlashAccount { slash_ratio };

    let (target_account, _) = get_target_address();
    let (config_pubkey, _) = get_config_address();
    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);
    let (stake_account_authority, _) =
        get_stake_account_custory_authority_address(stake_account_positions);

    let slash_account_accs = staking::accounts::SlashAccount {
        config: config_pubkey,
        publisher,
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        pool_authority: pool_authority.pubkey(),
        governance_target_account: target_account,
        custody_authority: stake_account_authority,
        token_program: spl_token::ID,
        destination,
    };

    let slash_account_ix = Instruction::new_with_bytes(
        staking::ID,
        &slash_account_data.data(),
        slash_account_accs.to_account_metas(None),
    );

    let slash_account_tx = Transaction::new_signed_with_payer(
        &[
            slash_account_ix,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[&payer, &pool_authority],
        svm.latest_blockhash(),
    );

    svm.send_transaction(slash_account_tx)
}
