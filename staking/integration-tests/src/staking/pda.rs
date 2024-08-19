use {
    solana_sdk::pubkey::Pubkey,
    staking::context::{
        CONFIG_SEED,
        MAX_VOTER_RECORD_SEED,
        TARGET_SEED,
        VOTING_TARGET_SEED,
    },
};

pub fn get_config_address_bump() -> u8 {
    Pubkey::find_program_address(&[CONFIG_SEED.as_bytes()], &staking::ID).1
}

pub fn get_config_address() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED.as_bytes()], &staking::ID).0
}

pub fn get_target_address() -> Pubkey {
    Pubkey::find_program_address(
        &[TARGET_SEED.as_bytes(), VOTING_TARGET_SEED.as_bytes()],
        &staking::ID,
    )
    .0
}

pub fn get_stake_account_metadata_address(stake_account_positions: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            staking::context::STAKE_ACCOUNT_METADATA_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
    .0
}

pub fn get_stake_account_custody_address(stake_account_positions: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            staking::context::CUSTODY_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
    .0
}

pub fn get_stake_account_custory_authority_address(stake_account_positions: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            staking::context::AUTHORITY_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
    .0
}

pub fn get_voter_record_address(stake_account_positions: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            staking::context::VOTER_RECORD_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
    .0
}

pub fn get_max_voter_record_address() -> Pubkey {
    Pubkey::find_program_address(
        &[staking::context::MAX_VOTER_RECORD_SEED.as_bytes()],
        &staking::ID,
    )
    .0
}
