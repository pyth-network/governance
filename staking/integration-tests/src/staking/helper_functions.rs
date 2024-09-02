use {
    super::{
        instructions::{
            create_stake_account,
            join_dao_llc,
        },
        pda::get_stake_account_custody_address,
    },
    crate::{
        solana::instructions::{
            airdrop_spl,
            create_account,
        },
        utils::constants::STAKED_TOKENS,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
    },
};


pub fn initialize_new_stake_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Keypair,
    join_dao: bool,
    airdrop: bool,
) -> Pubkey {
    let stake_account_positions = create_account(
        svm,
        payer,
        staking::state::positions::PositionData::LEN,
        staking::ID,
    );

    create_stake_account(svm, payer, pyth_token_mint, stake_account_positions).unwrap();

    if join_dao {
        join_dao_llc(svm, payer, stake_account_positions).unwrap();
    }

    if airdrop {
        let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

        airdrop_spl(
            svm,
            payer,
            stake_account_custody,
            pyth_token_mint,
            STAKED_TOKENS,
        );
    }

    stake_account_positions
}
