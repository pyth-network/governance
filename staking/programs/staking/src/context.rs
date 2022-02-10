
use anchor_lang::prelude::*;
use anchor_spl::{
    token::{TokenAccount, Token, Mint}
};
use std::{str::FromStr};
use crate::state::*;
use crate::constants::PYTH_TOKEN;

#[derive(Accounts)]
#[instruction(owner : Pubkey, lock : stake_account::VestingState, _bump_auth : u8)]
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
    #[account(address = Pubkey::from_str(PYTH_TOKEN).unwrap())]
    pub mint: Account<'info, Mint>, 
    pub rent: Sysvar<'info, Rent>,
    pub token_program : Program<'info, Token>,
    pub system_program : Program<'info, System>,
}