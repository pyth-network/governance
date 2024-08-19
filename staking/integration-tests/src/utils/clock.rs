use {
    crate::staking::pda::get_config_address,
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    integrity_pool::utils::clock::EPOCH_DURATION,
    litesvm::LiteSVM,
    solana_sdk::{
        clock::Clock,
        instruction::Instruction,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
    std::convert::TryInto,
};

pub fn advance_n_epochs(svm: &mut LiteSVM, payer: &Keypair, n: u64) {
    svm.expire_blockhash();
    let seconds = TryInto::<i64>::try_into(EPOCH_DURATION * n).unwrap();

    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp += seconds;
    svm.set_sysvar::<Clock>(&clock);

    advance_mock_clock(svm, payer, seconds) // we need this since we're still using mock clock in
                                            // the staking program
}

pub fn get_current_epoch(svm: &mut LiteSVM) -> u64 {
    let clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp as u64 / EPOCH_DURATION
}

pub fn advance_mock_clock(svm: &mut LiteSVM, payer: &Keypair, seconds: i64) {
    let config_address = get_config_address();

    if svm.get_account(&config_address).is_none() {
        return;
    }

    let accs = staking::accounts::AdvanceClock {
        config: config_address,
    };

    let data = staking::instruction::AdvanceClock { seconds };

    let ix = Instruction::new_with_bytes(staking::ID, &data.data(), accs.to_account_metas(None));

    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).unwrap();
}
