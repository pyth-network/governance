use {
    crate::state::vesting::VestingSchedule,
    anchor_lang::prelude::{
        borsh::BorshSchema,
        *,
    },
};

/// This is the metadata account for each staker
/// It is derived from the positions account with seeds "stake_metadata" and the positions account
/// pubkey It stores some PDA bumps, the owner of the account and the vesting schedule

pub const STAKE_ACCOUNT_METADATA_SIZE: usize = 10240;

#[account]
#[derive(BorshSchema)]
pub struct StakeAccountMetadataV2 {
    pub metadata_bump:  u8,
    pub custody_bump:   u8,
    pub authority_bump: u8,
    pub voter_bump:     u8,
    pub owner:          Pubkey,
    pub lock:           VestingSchedule,
    pub next_index:     u8,
}

#[cfg(test)]
pub mod tests {
    use {
        crate::state::stake_account::{
            StakeAccountMetadataV2,
            STAKE_ACCOUNT_METADATA_SIZE,
        },
        anchor_lang::Discriminator,
    };

    #[test]
    fn check_size() {
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<StakeAccountMetadataV2>()
                + StakeAccountMetadataV2::discriminator().len()
                <= STAKE_ACCOUNT_METADATA_SIZE
        );
    }
}
