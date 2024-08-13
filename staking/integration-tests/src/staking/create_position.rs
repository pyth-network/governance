use {
    super::pda::{
        get_config_address,
        get_stake_account_custody_address,
        get_stake_account_metadata_address,
        get_target_address,
    },
    anchor_lang::{
        system_program,
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::utils::types::frac64,
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    staking::state::positions::TargetWithParameters,
};


pub fn create_position(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    stake_account_positions: Pubkey,
    target_with_parameters: TargetWithParameters,
    pool_authority: Option<&Keypair>,
    amount: frac64,
) {
    let (config_pubkey, _) = get_config_address();
    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);

    let create_position_data = staking::instruction::CreatePosition {
        target_with_parameters,
        amount,
    };

    let target_account = match target_with_parameters {
        TargetWithParameters::Voting => Some(get_target_address().0),
        TargetWithParameters::IntegrityPool { .. } => None,
    };

    let create_position_accs = staking::accounts::CreatePosition {
        config: config_pubkey,
        stake_account_metadata,
        stake_account_positions,
        stake_account_custody,
        owner: payer.pubkey(),
        target_account,
        pool_authority: pool_authority.map(|k| k.pubkey()),
        system_program: system_program::ID,
    };

    let create_position_ix = Instruction::new_with_bytes(
        staking::ID,
        &create_position_data.data(),
        create_position_accs.to_account_metas(None),
    );


    let mut signing_keypairs: Vec<&Keypair> = vec![&payer];

    if let Some(pool_authority) = pool_authority {
        signing_keypairs.push(pool_authority);
    }

    let create_position_tx = Transaction::new_signed_with_payer(
        &[create_position_ix],
        Some(&payer.pubkey()),
        signing_keypairs.as_slice(),
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_position_tx).unwrap();
}
