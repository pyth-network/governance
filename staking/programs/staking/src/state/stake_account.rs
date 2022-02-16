use anchor_lang::prelude::*;
use crate::state::vesting::VestingSchedule;
use crate::error::ErrorCode;

/// This is the main account for each staker
/// There's also an implicitly connected token account that's a PDA
/// We don't store the token balance here so that we don't have to keep
/// the two numbers in sync.

#[account]
#[derive(Default)]
pub struct StakeAccountMetadata {
    pub custody_bump: u8,
    pub authority_bump: u8,
    pub metadata_bump: u8,
    pub owner: Pubkey,
    pub lock: VestingSchedule,
}