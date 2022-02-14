
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct GlobalConfig {
    pub bump : u8,
    pub governance_authority: Pubkey,
    pub pyth_token_mint: Pubkey,
    pub unbonding_duration: u8,
}