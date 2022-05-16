use crate::state::vesting::VestingSchedule;
use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;

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

impl StakeAccountMetadata {
    /// Returns a StakeAccountMetadataV2 with the same values as self and the provided value for
    /// next_index (the new field)
    pub fn as_v2(&self, next_index: u8) -> StakeAccountMetadataV2 {
        StakeAccountMetadataV2 {
            metadata_bump: self.metadata_bump,
            custody_bump: self.custody_bump,
            authority_bump: self.authority_bump,
            voter_bump: self.voter_bump,
            owner: self.owner,
            lock: self.lock,
            next_index,
        }
    }
}


#[cfg(test)]
pub mod tests {
    use crate::state::stake_account::{
        StakeAccountMetadataV2,
        STAKE_ACCOUNT_METADATA_SIZE,
    };
    use crate::state::vesting::VestingSchedule;
    use anchor_lang::prelude::Pubkey;
    use anchor_lang::Discriminator;

    use super::StakeAccountMetadata;

    #[test]
    fn check_size() {
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<StakeAccountMetadataV2>()
                + StakeAccountMetadataV2::discriminator().len()
                <= STAKE_ACCOUNT_METADATA_SIZE
        );
    }
    #[test]
    fn check_upgrade() {
        // Make sure I didn't get one of the bumps wrong
        let v1 = StakeAccountMetadata {
            metadata_bump:  1,
            custody_bump:   2,
            authority_bump: 3,
            voter_bump:     4,
            owner:          Pubkey::new_unique(),
            lock:           VestingSchedule::PeriodicVesting {
                initial_balance: 5,
                start_date:      6,
                period_duration: 7,
                num_periods:     8,
            },
        };
        let v2 = v1.as_v2(9);
        macro_rules! assert_v1_v2_match {
            ( $c:ident ) => {
                assert_eq!(v1.$c, v2.$c);
            };
        }

        assert_v1_v2_match!(metadata_bump);
        assert_v1_v2_match!(custody_bump);
        assert_v1_v2_match!(authority_bump);
        assert_v1_v2_match!(voter_bump);
        assert_v1_v2_match!(owner);
        assert_v1_v2_match!(lock);
        assert_eq!(v2.next_index, 9);
    }
}
