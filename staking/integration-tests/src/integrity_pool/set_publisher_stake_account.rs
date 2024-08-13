use {
    super::pda::get_pool_config_address,
    crate::utils::account::fetch_account_data,
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::state::pool::PoolConfig,
    litesvm::types::TransactionResult,
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};


pub fn set_publisher_stake_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    signer: &Keypair,
    publisher: Pubkey,
    current_stake_account_positions_option: Option<Pubkey>,
    new_stake_account_positions: Pubkey,
) -> TransactionResult {
    let (pool_config, _) = get_pool_config_address();
    let pool_data: Pubkey = fetch_account_data::<PoolConfig>(svm, &pool_config).pool_data;

    let data = integrity_pool::instruction::SetPublisherStakeAccount {};
    let accs = integrity_pool::accounts::SetPublisherStakeAccount {
        signer: signer.pubkey(),
        publisher,
        pool_data,
        current_stake_account_positions_option,
        new_stake_account_positions,
        pool_config,
    };

    let ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &data.data(),
        accs.to_account_metas(None),
    );

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer, &signer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx)
}
