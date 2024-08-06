use {
    anchor_lang::{
        AccountDeserialize,
        AnchorDeserialize,
    },
    bytemuck::{
        Pod,
        Zeroable,
    },
    solana_sdk::{
        message::Message,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        system_instruction,
        transaction::Transaction,
    },
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

    let transaction = Transaction::new(
        &[payer, &account],
        Message::new(&[instruction], Some(&payer.pubkey())),
        svm.latest_blockhash(),
    );
    svm.send_transaction(transaction).unwrap();

    account.pubkey()
}

pub fn fetch_account_data<T: AnchorDeserialize + AccountDeserialize>(
    svm: &mut litesvm::LiteSVM,
    account: &Pubkey,
) -> T {
    T::try_deserialize(&mut svm.get_account(account).unwrap().data.as_ref()).unwrap()
}

pub fn fetch_account_data_bytemuck<T: Pod + Zeroable + AccountDeserialize>(
    svm: &mut litesvm::LiteSVM,
    account: &Pubkey,
) -> T {
    let size = std::mem::size_of::<T>();
    T::try_deserialize(&mut &svm.get_account(account).unwrap().data.as_slice()[..size + 8]).unwrap()
}
