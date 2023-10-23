use {
    crate::{
        error::ErrorCode,
        state::vesting::VestingSchedule,
    },
    anchor_lang::prelude::{
        borsh::BorshSchema,
        *,
    },
};

/// This is the metadata account for each staker
/// It is derived from the positions account with seeds "stake_metadata" and the positions account
/// pubkey It stores some PDA bumps, the owner of the account and the vesting schedule

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
    pub transfer_epoch: Option<u64>, // null if the account was created, some epoch if the account received a transfer
    pub is_llc_member:  bool,
}

impl StakeAccountMetadataV2 {
    pub const LEN: usize = 200;

    pub fn check_is_llc_member(&self) -> Result<()> {
        if self.is_llc_member {
            Ok(())
        } else {
            err!(ErrorCode::NotLlcMember)
        }
    }
}

#[cfg(test)]
pub mod tests {
    use {
        crate::state::{
            stake_account::StakeAccountMetadataV2,
            vesting::VestingSchedule,
        },
        anchor_lang::Discriminator,
        solana_program::pubkey::Pubkey,
    };

    #[test]
    fn check_size() {
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<StakeAccountMetadataV2>()
                + StakeAccountMetadataV2::discriminator().len()
                <= StakeAccountMetadataV2::LEN
        );
    }

    #[test]
    fn check_is_llc_member() {
        let stake_account_metadata_llc_member = StakeAccountMetadataV2 {
            metadata_bump:  0,
            custody_bump:   0,
            authority_bump: 0,
            voter_bump:     0,
            owner:          Pubkey::default(),
            lock:           VestingSchedule::FullyVested,
            next_index:     0,
            transfer_epoch: None,
            is_llc_member:  true,
        };
        assert!(stake_account_metadata_llc_member
            .check_is_llc_member()
            .is_ok());

        let stake_account_metadata_non_llc_member = StakeAccountMetadataV2 {
            metadata_bump:  0,
            custody_bump:   0,
            authority_bump: 0,
            voter_bump:     0,
            owner:          Pubkey::default(),
            lock:           VestingSchedule::FullyVested,
            next_index:     0,
            transfer_epoch: None,
            is_llc_member:  false,
        };
        assert!(stake_account_metadata_non_llc_member
            .check_is_llc_member()
            .is_err());
    }
}
