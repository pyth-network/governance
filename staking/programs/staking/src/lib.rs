use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use context::*;
use state::{
    global_config::GlobalConfig,
    positions::{PositionData, PositionState, StakeAccountPosition, MAX_POSITIONS},
    vesting::VestingSchedule,
};
use utils::clock::get_current_epoch;

mod constants;
mod context;
mod error;
mod state;
mod utils;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod staking {
    use super::*;
    pub fn init_config(ctx: Context<InitConfig>, global_config: GlobalConfig) -> ProgramResult {
        let config_account = &mut ctx.accounts.config_account;
        config_account.bump = *ctx.bumps.get("config_account").unwrap();
        config_account.governance_authority = global_config.governance_authority;
        config_account.pyth_token_mint = global_config.pyth_token_mint;
        config_account.unlocking_duration = global_config.unlocking_duration;
        config_account.epoch_duration = global_config.epoch_duration;
        Ok(())
    }

    pub fn create_stake_account(
        ctx: Context<CreateStakeAccount>,
        owner: Pubkey,
        lock: VestingSchedule,
    ) -> ProgramResult {
        // let stake_account = &mut ctx.accounts.stake_account.load_init()?;
        let stake_account_metadata = &mut ctx.accounts.stake_account_metadata;
        stake_account_metadata.custody_bump = *ctx.bumps.get("stake_account_custody").unwrap();
        stake_account_metadata.authority_bump = *ctx.bumps.get("custody_authority").unwrap();
        stake_account_metadata.metadata_bump = *ctx.bumps.get("stake_account_metadata").unwrap();
        stake_account_metadata.owner = owner;
        stake_account_metadata.lock = lock;
        Ok(())
    }

    pub fn create_position(
        ctx: Context<CreatePostion>,
        product: Pubkey,
        publisher: Pubkey,
        amount: u64,
    ) -> ProgramResult {
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config.epoch_duration).unwrap();
        let current_exposure = PositionData::get_current_exposure_to_product(
            stake_account_positions,
            current_epoch,
            config.unlocking_duration,
            product,
        )
        .unwrap();

        if current_exposure.checked_add(amount).unwrap() > stake_account_custody.amount {
            return Err(ErrorCode::InsufficientBalanceCreatePosition.into());
        }

        msg!("{}", current_exposure);
        msg!("{}", current_epoch);
        msg!("{:?}", stake_account_positions.positions[0]
        .get_current_position(current_epoch, config.unlocking_duration)
        .unwrap());
        let mut i = 0;
        while i < MAX_POSITIONS
            && stake_account_positions.positions[i]
                .get_current_position(current_epoch, config.unlocking_duration)
                .unwrap()
                != PositionState::UNLOCKED
        {
            i += 1;
        }

        if i == MAX_POSITIONS {
            return Err(ErrorCode::InsufficientBalanceCreatePosition.into());
        } else {
            stake_account_positions.positions[i] = StakeAccountPosition {
                amount: amount,
                product: product,
                publisher: publisher,
                activation_epoch: get_current_epoch(ctx.accounts.config.epoch_duration).unwrap(),
                unlocking_start: u64::MAX,
            };
            Ok(())
        }
    }

    pub fn split_position(ctx: Context<SplitPosition>) -> ProgramResult {
        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> ProgramResult {
        Ok(())
    }

    pub fn cleanup_positions(ctx: Context<CleanupPostions>) -> ProgramResult {
        Ok(())
    }
}
