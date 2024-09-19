use {
    anchor_spl::{
        associated_token::spl_associated_token_account,
        token::spl_token,
    },
    litesvm::types::TransactionResult,
    solana_sdk::{
        program_pack::Pack,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        system_instruction,
        transaction::Transaction,
    },
    spl_token::{
        instruction::initialize_account,
        state::Account,
    },
    std::convert::TryInto,
};

pub fn create_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    size: usize,
    owner: Pubkey,
) -> Pubkey {
    let account = Keypair::new();
    let lamports = svm.minimum_balance_for_rent_exemption(size);
    let instruction = system_instruction::create_account(
        &payer.pubkey(),
        &account.pubkey(),
        lamports,
        size as u64,
        &owner,
    );

    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[payer, &account],
        svm.latest_blockhash(),
    );
    svm.send_transaction(transaction).unwrap();

    account.pubkey()
}

pub fn create_token_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Pubkey,
) -> Keypair {
    let keypair = Keypair::new();
    let rent_exemption = svm.minimum_balance_for_rent_exemption(Account::LEN);

    let create_account_ix = solana_sdk::system_instruction::create_account(
        &payer.pubkey(),
        &keypair.pubkey(),
        rent_exemption,
        Account::LEN as u64,
        &spl_token::ID,
    );

    let initialize_account_ix = initialize_account(
        &spl_token::ID,
        &keypair.pubkey(),
        pyth_token_mint,
        &payer.pubkey(),
    )
    .unwrap();

    let transaction = Transaction::new_signed_with_payer(
        &[create_account_ix, initialize_account_ix],
        Some(&payer.pubkey()),
        &[payer, &keypair],
        svm.latest_blockhash(),
    );

    svm.send_transaction(transaction).unwrap();

    keypair
}

pub fn init_mint_account(svm: &mut litesvm::LiteSVM, payer: &Keypair, pyth_token_mint: &Keypair) {
    let mint_rent = svm.minimum_balance_for_rent_exemption(spl_token::state::Mint::LEN);
    let mint_tx = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &payer.pubkey(),
                &pyth_token_mint.pubkey(),
                mint_rent,
                spl_token::state::Mint::LEN.try_into().unwrap(),
                &spl_token::id(),
            ),
            spl_token::instruction::initialize_mint(
                &spl_token::id(),
                &pyth_token_mint.pubkey(),
                &pyth_token_mint.pubkey(),
                None,
                0,
            )
            .unwrap(),
        ],
        Some(&payer.pubkey()),
        &[&payer, &pyth_token_mint],
        svm.latest_blockhash(),
    );
    svm.send_transaction(mint_tx).unwrap();
}

pub fn airdrop_spl(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    destination: Pubkey,
    mint: &Keypair,
    amount: u64,
) {
    let mint_to_ix = spl_token::instruction::mint_to(
        &spl_token::id(),
        &mint.pubkey(),
        &destination,
        &mint.pubkey(),
        &[&payer.pubkey(), &mint.pubkey()],
        amount,
    )
    .unwrap();
    let mint_to_tx = Transaction::new_signed_with_payer(
        &[mint_to_ix],
        Some(&payer.pubkey()),
        &[&payer, &mint],
        svm.latest_blockhash(),
    );
    svm.send_transaction(mint_to_tx).unwrap();
}

pub fn initialize_ata(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    mint: Pubkey,
    authority: Pubkey,
) -> TransactionResult {
    let create_ata_ix = spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        &authority,
        &mint,
        &spl_token::ID,
    );

    let create_ata_tx = Transaction::new_signed_with_payer(
        &[create_ata_ix],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_ata_tx)
}
