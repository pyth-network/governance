use {
    anchor_lang::{
        AccountDeserialize,
        AnchorDeserialize,
    },
    bytemuck::{
        Pod,
        Zeroable,
    },
    solana_sdk::pubkey::Pubkey,
    staking::state::positions::DynamicPositionArrayAccount,
};


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

pub fn fetch_positions_account(
    svm: &mut litesvm::LiteSVM,
    address: &Pubkey,
) -> DynamicPositionArrayAccount {
    let account = &svm.get_account(address).unwrap();
    DynamicPositionArrayAccount::default_with_data(&account.data)
}
