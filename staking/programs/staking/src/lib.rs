use anchor_lang::prelude::*;
use context::*;
use state::{global_config::GlobalConfig, stake_account::VestingState};

mod constants;
mod context;
mod state;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod staking {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, global_config : GlobalConfig) -> ProgramResult {
        msg!("{}", global_config.governance_authority);
        *ctx.accounts.config_account = global_config;
        Ok(())
    }

    pub fn create_stake_account(ctx: Context<CreateStakeAccount>, owner : Pubkey, lock : VestingState, _bump_auth : u8, _bump_config : u8) -> ProgramResult {
        let stake_account = &mut ctx.accounts.stake_account;
        stake_account.owner = owner;
        stake_account.lock = lock;

        msg!("{}", ctx.accounts.config.pyth_token_mint);
        msg!("{}", ctx.accounts.mint.key());
        Ok(())
    }
}
