use crate::state::vesting::VestingSchedule;
use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;

/// This is the metadata account for each staker
/// It is derived from the positions account with seeds "stake_metadata" and the positions account
/// pubkey It stores some PDA bumps, the owner of the account and the vesting schedule

pub const STAKE_ACCOUNT_METADATA_SIZE: usize = 8 + 1 + 1 + 1 + 1 + 32 + 1 + 8 * 4;

#[account]
#[derive(BorshSchema)]
pub struct StakeAccountMetadata {
    pub metadata_bump:  u8,
    pub custody_bump:   u8,
    pub authority_bump: u8,
    pub voter_bump:     u8,
    pub owner:          Pubkey,
    pub lock:           VestingSchedule,
}

#[cfg(test)]
pub mod tests {
    use crate::state::stake_account::{
        StakeAccountMetadata,
        STAKE_ACCOUNT_METADATA_SIZE,
    };
    use anchor_lang::Discriminator;

    #[test]
    fn check_size() {
        assert_eq!(
            anchor_lang::solana_program::borsh::get_packed_len::<StakeAccountMetadata>()
                + StakeAccountMetadata::discriminator().len(),
            STAKE_ACCOUNT_METADATA_SIZE
        );
    }
}
