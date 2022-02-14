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
        let config_account = &mut ctx.accounts.config_account;
        config_account.bump = *ctx.bumps.get("config_account").unwrap();
        config_account.governance_authority = global_config.governance_authority;
        config_account.pyth_token_mint = global_config.pyth_token_mint;
        config_account.unbonding_duration = global_config.unbonding_duration;
        Ok(())
    }

    pub fn create_stake_account(ctx: Context<CreateStakeAccount>, owner : Pubkey, lock : VestingState) -> ProgramResult {
        let stake_account = &mut ctx.accounts.stake_account;
        stake_account.custody_bump = *ctx.bumps.get("stake_account_custody").unwrap();
        stake_account.authority_bump = *ctx.bumps.get("custody_authority").unwrap();
        stake_account.owner = owner;
        stake_account.lock = lock;

        Ok(())
    }
}
