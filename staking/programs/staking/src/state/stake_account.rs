use anchor_lang::prelude::*;
use crate::state::vesting::VestingSchedule;

/// This is the metadata account for each staker
/// It is derived from the positions account with seeds "stake_metadata" and the positions account pubkey
/// It stores some PDA bumps, the owner of the account and the vesting schedule

#[account]
#[derive(Default)]
pub struct StakeAccountMetadata {
    pub custody_bump: u8,
    pub authority_bump: u8,
    pub metadata_bump: u8,
    pub voter_bump : u8,
    pub owner: Pubkey,
    pub lock: VestingSchedule,
}