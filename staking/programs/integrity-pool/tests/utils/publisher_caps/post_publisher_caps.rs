use {
    crate::utils::account::create_account,
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    litesvm::LiteSVM,
    publisher_caps::PublisherCaps,
    solana_sdk::{
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        transaction::Transaction,
    },
};

pub fn post_publisher_caps(
    svm: &mut LiteSVM,
    payer: &Keypair,
    first_publisher: Pubkey,
    first_publisher_cap: u64,
) -> Pubkey {
    let publisher_caps = create_account(svm, payer, PublisherCaps::LEN, publisher_caps::ID);

    let accounts = publisher_caps::accounts::PostPublisherCaps {
        signer: payer.pubkey(),
        publisher_caps,
    };

    let instruction_data = publisher_caps::instruction::PostPublisherCaps {
        first_publisher,
        first_publisher_cap,
    };

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    let transaction = Transaction::new_signed_with_payer(
        &[
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(transaction).unwrap();

    publisher_caps
}
