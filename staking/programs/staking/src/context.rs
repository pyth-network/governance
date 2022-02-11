
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{TokenAccount, Token, Mint}
};
use crate::state::*;

#[derive(Accounts)]
#[instruction(config_data : global_config::GlobalConfig)]
pub struct InitConfig<'info>{
    pub payer : Signer<'info>,
    #[account(
        init,
        seeds = [global_config::CONFIG_SEED],
        bump,
        payer = payer,
    )]
    pub config_account : Account<'info, global_config::GlobalConfig>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program : Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(owner : Pubkey, lock : stake_account::VestingState, _bump_auth : u8, _bump_config : u8)]
pub struct CreateStakeAccount<'info>{
    pub payer : Signer<'info>,
    #[account(init, payer = payer)]
    pub stake_account : Account<'info, stake_account::StakeAccountData>,
    #[account(
        init,
        seeds = [stake_account::CUSTODY_SEED, stake_account.key().as_ref()],
        bump,
        payer = payer,
        token::mint = mint,
        token::authority = custody_authority,
    )]
    pub stake_account_custody : Account<'info, TokenAccount>,
    #[account(seeds = [stake_account::AUTHORITY_SEED, stake_account.key().as_ref()], bump = _bump_auth)]
    pub custody_authority : AccountInfo<'info>,
    #[account(seeds = [global_config::CONFIG_SEED], bump = _bump_config)]
    pub config : Account<'info, global_config::GlobalConfig>,
    #[account(address = config.pyth_token_mint)]
    pub mint: Account<'info, Mint>, 
    pub rent: Sysvar<'info, Rent>,
    pub token_program : Program<'info, Token>,
    pub system_program : Program<'info, System>,
}