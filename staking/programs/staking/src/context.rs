
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{TokenAccount, Token, Mint}
};
use crate::state::*;

pub const AUTHORITY_SEED: &str = "authority";
pub const CUSTODY_SEED: &str = "custody";
pub const CONFIG_SEED: &str = "config";

#[derive(Accounts)]
#[instruction(config_data : global_config::GlobalConfig)]
pub struct InitConfig<'info>{
    pub payer : Signer<'info>,
    #[account(
        init,
        seeds = [CONFIG_SEED.as_bytes()],
        bump,
        payer = payer,
    )]
    pub config_account : Account<'info, global_config::GlobalConfig>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program : Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(owner : Pubkey, lock : stake_account::VestingState)]
pub struct CreateStakeAccount<'info>{
    pub payer : Signer<'info>,
    #[account(init, payer = payer)]
    pub stake_account : Account<'info, stake_account::StakeAccountData>,
    #[account(
        init,
        seeds = [CUSTODY_SEED.as_bytes(), stake_account.key().as_ref()],
        bump,
        payer = payer,
        token::mint = mint,
        token::authority = custody_authority,
    )]
    pub stake_account_custody : Account<'info, TokenAccount>,
    #[account(seeds = [AUTHORITY_SEED.as_bytes(), stake_account.key().as_ref()], bump)]
    pub custody_authority : AccountInfo<'info>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config : Account<'info, global_config::GlobalConfig>,
    #[account(address = config.pyth_token_mint)]
    pub mint: Account<'info, Mint>, 
    pub rent: Sysvar<'info, Rent>,
    pub token_program : Program<'info, Token>,
    pub system_program : Program<'info, System>,
}