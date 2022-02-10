use anchor_lang::prelude::*;
use context::*;
use state::stake_account::VestingState;

mod constants;
mod context;
mod state;

declare_id!("E2QSDnMYDVVg8LeKXcDWXJGiUvG3C7aE4fwuEhTULru1");

#[program]
pub mod staking {
    use super::*;
    pub fn create_stake_account(ctx: Context<CreateStakeAccount>, owner : Pubkey, lock : VestingState, _bump_auth : u8) -> ProgramResult {
        let stake_account = &mut ctx.accounts.stake_account;
        stake_account.owner = owner;
        stake_account.lock = lock;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
