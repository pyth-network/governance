use {
    super::init_config::get_config_address,
    anchor_lang::{
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    staking::{
        context::{
            TARGET_SEED,
            VOTING_TARGET_SEED,
        },
        state::positions::Target,
    },
};

pub fn get_target_address() -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TARGET_SEED.as_bytes(), VOTING_TARGET_SEED.as_bytes()],
        &staking::ID,
    )
}

pub fn create_target_account(svm: &mut litesvm::LiteSVM, payer: &Keypair) {
    let (target_account, _) = get_target_address();
    let (config_account, _) = get_config_address();

    let target_data = staking::instruction::CreateTarget {
        _target: Target::Voting,
    };
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
