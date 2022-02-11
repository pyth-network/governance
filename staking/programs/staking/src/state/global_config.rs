
use anchor_lang::prelude::*;
pub const CONFIG_SEED: &[u8] = b"config";

#[account]
#[derive(Default)]
pub struct GlobalConfig {
    pub governance_authority: Pubkey,
    pub pyth_token_mint: Pubkey,
    pub unbonding_duration: u8,
}