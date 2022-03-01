use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::token::transfer;
use context::*;
use state::{
    global_config::GlobalConfig,
    positions::{Position, PositionData, PositionState, MAX_POSITIONS},
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
    use std::convert::TryInto;

    use anchor_lang::solana_program::clock::UnixTimestamp;

    /// Creates a global config for the program
    use super::*;
    pub fn init_config(ctx: Context<InitConfig>, global_config: GlobalConfig) -> Result<()> {
        let config_account = &mut ctx.accounts.config_account;
        config_account.bump = *ctx.bumps.get("config_account").unwrap();
        config_account.governance_authority = global_config.governance_authority;
        config_account.pyth_token_mint = global_config.pyth_token_mint;
        config_account.pyth_governance_realm = global_config.pyth_governance_realm;
        config_account.unlocking_duration = global_config.unlocking_duration;
        config_account.epoch_duration = global_config.epoch_duration;

        if (global_config.epoch_duration == 0) {
            return Err(error!(ErrorCode::ZeroEpochDuration));
        }
        Ok(())
    }

    /// Trustless instruction that creates a stake account for a user
    /// The main account i.e. the position accounts needs to be initialized outside of the program otherwise we run into stack limits
    pub fn create_stake_account(
        ctx: Context<CreateStakeAccount>,
        owner: Pubkey,
        lock: VestingSchedule,
    ) -> Result<()> {
        let stake_account_metadata = &mut ctx.accounts.stake_account_metadata;
        stake_account_metadata.custody_bump = *ctx.bumps.get("stake_account_custody").unwrap();
        stake_account_metadata.authority_bump = *ctx.bumps.get("custody_authority").unwrap();
        stake_account_metadata.metadata_bump = *ctx.bumps.get("stake_account_metadata").unwrap();
        stake_account_metadata.voter_bump = *ctx.bumps.get("voter_record").unwrap();
        stake_account_metadata.owner = owner;
        stake_account_metadata.lock = lock;

        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_init()?;
        stake_account_positions.positions = [None; MAX_POSITIONS];

        let voter_record = &mut ctx.accounts.voter_record;
        let config = &ctx.accounts.config;
        voter_record.realm = config.pyth_governance_realm;
        voter_record.governing_token_mint = config.pyth_token_mint;
        voter_record.governing_token_owner = owner;

        Ok(())
    }

    /// Creates a position
    /// Looks for the first available place in the array, fails if array is full
    /// Computes risk and fails if new positions exceed risk limit
    pub fn create_position(
        ctx: Context<CreatePostion>,
        product: Option<Pubkey>,
        publisher: Option<Pubkey>,
        amount: u64,
    ) -> Result<()> {
        if amount == 0 {
            return Err(error!(ErrorCode::CreatePositionWithZero));
        }

        // TODO: Should we check that product and publisher are legitimate?
        // I don't think anyone has anything to gain from adding a position to a fake product
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config.epoch_duration)?;

        match PositionData::get_unused_index(stake_account_positions) {
            Err(x) => return Err(x),
            Ok(i) => {
                stake_account_positions.positions[i] = Some(Position {
                    amount: amount,
                    product: product,
                    publisher: publisher,
                    activation_epoch: current_epoch + 1,
                    unlocking_start: None,
                });
            }
        }

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time())
            .unwrap();
        utils::risk::validate(
            &stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )?;

        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>, index: u8) -> Result<()> {
        let i = index as usize;
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config.epoch_duration)?;

        if stake_account_positions.positions[i].is_some() {
            match stake_account_positions.positions[i]
                .unwrap()
                .get_current_position(current_epoch, config.unlocking_duration)
                .unwrap()
            {
                PositionState::LOCKING | PositionState::UNLOCKED => {
                    let current_position = stake_account_positions.positions[i].unwrap();
                    stake_account_positions.positions[i] = None;
                }
                PositionState::LOCKED => {
                    // This hasn't been tested
                    let current_position = &mut stake_account_positions.positions[i].unwrap();
                    current_position.unlocking_start = Some(current_epoch + 1);
                }
                _ => {}
            }
        }

        Ok(())
    }

    pub fn withdraw_stake(ctx: Context<WithdrawStake>, amount: u64) -> Result<()> {
        let stake_account_positions = &ctx.accounts.stake_account_positions.load()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let stake_account_metadata = &ctx.accounts.stake_account_metadata;
        let destination_account = &ctx.accounts.destination;
        let signer = &ctx.accounts.payer;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config.epoch_duration).unwrap();

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time())
            .unwrap();

        if (destination_account.owner != *signer.key) {
            return Err(error!(ErrorCode::WithdrawToUnathorizedAccount));
        }

        transfer(
            CpiContext::from(&*ctx.accounts).with_signer(&[&[
                AUTHORITY_SEED.as_bytes(),
                ctx.accounts.stake_account_positions.key().as_ref(),
                &[stake_account_metadata.authority_bump],
            ]]),
            amount,
        )?;

        if utils::risk::validate(
            &stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )
        .is_err()
        {
            return Err(error!(ErrorCode::InsufficientWithdrawableBalance));
        }

        Ok(())
    }

    pub fn revise(ctx: Context<Revise>) -> Result<()> {
        let stake_account_positions = &ctx.accounts.stake_account_positions.load()?;
        let voter_record = &mut ctx.accounts.voter_record;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config.epoch_duration).unwrap();

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time())
            .unwrap();

        utils::risk::validate(
            &stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )?;

        let mut voter_weight = 0;
        for i in 0..MAX_POSITIONS {
            if stake_account_positions.positions[i].is_some() {
                let position = stake_account_positions.positions[i].unwrap();
                match position.get_current_position(current_epoch, config.unlocking_duration)? {
                    PositionState::LOCKED => {
                        if position.product.is_none() {
                            voter_weight += position.amount;
                        }
                    }
                    _ => {}
                }
            }
        }
        // This should not be able to underflow, so panic is okay
        voter_record.voter_weight = voter_weight;
        voter_record.voter_weight_expiry = Some(Clock::get()?.slot);
        Ok(())
    }
    pub fn split_position(ctx: Context<SplitPosition>) -> Result<()> {
        Ok(())
    }

    pub fn cleanup_positions(ctx: Context<CleanupPostions>) -> Result<()> {
        Ok(())
    }
}
