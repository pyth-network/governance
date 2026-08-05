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
            create_account_at,
        },
        utils::constants::STAKED_TOKENS,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
    },
    staking::state::vesting::VestingSchedule,
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

    initialize_stake_account(
        svm,
        payer,
        pyth_token_mint,
        join_dao,
        airdrop,
        stake_account_positions,
        VestingSchedule::FullyVested,
    )
}

/// Same as `initialize_new_stake_account`, but the positions account is placed at
/// `stake_account_positions` instead of at a fresh keypair, and the lock is configurable.
pub fn initialize_new_stake_account_at(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Keypair,
    join_dao: bool,
    airdrop: bool,
    stake_account_positions: Pubkey,
    lock: VestingSchedule,
) -> Pubkey {
    create_account_at(
        svm,
        stake_account_positions,
        staking::state::positions::PositionData::LEN,
        staking::ID,
    );

    initialize_stake_account(
        svm,
        payer,
        pyth_token_mint,
        join_dao,
        airdrop,
        stake_account_positions,
        lock,
    )
}

fn initialize_stake_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Keypair,
    join_dao: bool,
    airdrop: bool,
    stake_account_positions: Pubkey,
    lock: VestingSchedule,
) -> Pubkey {
    create_stake_account(svm, payer, pyth_token_mint, stake_account_positions, lock).unwrap();

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
