use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::log;
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
#[cfg(feature = "wasm")]
pub mod wasm;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod staking {
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
        #[cfg(feature = "mock-clock")]
        {
            config_account.mock_clock_time = global_config.mock_clock_time;
        }

        if global_config.epoch_duration == 0 {
            return Err(error!(ErrorCode::ZeroEpochDuration));
        }
        Ok(())
    }

    /// Trustless instruction that creates a stake account for a user
    /// The main account i.e. the position accounts needs to be initialized outside of the program otherwise we run into stack limits
    #[inline(never)]
    pub fn create_stake_account(
        ctx: Context<CreateStakeAccount>,
        owner: Pubkey,
        lock: VestingSchedule,
    ) -> Result<()> {
        let stake_account_metadata = &mut ctx.accounts.stake_account_metadata;
        stake_account_metadata.metadata_bump = *ctx.bumps.get("stake_account_metadata").unwrap();
        stake_account_metadata.custody_bump = *ctx.bumps.get("stake_account_custody").unwrap();
        stake_account_metadata.authority_bump = *ctx.bumps.get("custody_authority").unwrap();
        stake_account_metadata.voter_bump = *ctx.bumps.get("voter_record").unwrap();
        stake_account_metadata.owner = owner;
        stake_account_metadata.lock = lock;

        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_init()?;
        stake_account_positions.owner = owner;
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
        ctx: Context<CreatePosition>,
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
        let current_epoch = get_current_epoch(config)?;

        // Make sure both are Some() or both are None
        if product.is_none() != publisher.is_none() {
            return Err(error!(ErrorCode::InvalidPosition));
        }

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
            .get_unvested_balance(utils::clock::get_current_time(config))?;

        utils::risk::validate(
            &stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )?;

        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>, index: u8, amount: u64) -> Result<()> {
        let i = index as usize;
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config)?;

        let current_position =
            &mut stake_account_positions.positions[i].ok_or(error!(ErrorCode::PositionNotInUse))?;

        let remaining_amount = current_position
            .amount
            .checked_sub(amount)
            .ok_or(error!(ErrorCode::AmountBiggerThanPosition))?;

        match current_position.get_current_position(current_epoch, config.unlocking_duration)? {
            PositionState::LOCKING | PositionState::UNLOCKED => {
                if remaining_amount == 0 {
                    stake_account_positions.positions[i] = None;
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.positions[i] = Some(*current_position);
                }
            }
            PositionState::LOCKED => {
                if remaining_amount == 0 {
                    current_position.unlocking_start = Some(current_epoch + 1);
                    stake_account_positions.positions[i] = Some(*current_position);
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.positions[i] = Some(*current_position);

                    match PositionData::get_unused_index(stake_account_positions) {
                        Err(x) => return Err(x),
                        Ok(i) => {
                            stake_account_positions.positions[i] = Some(Position {
                                amount: amount,
                                product: current_position.product,
                                publisher: current_position.publisher,
                                activation_epoch: current_position.activation_epoch,
                                unlocking_start: Some(current_epoch + 1),
                            });
                        }
                    }
                }
            }
            PositionState::UNLOCKING => {
                return Err(error!(ErrorCode::AlreadyUnlocking));
            }
        }

        Ok(())
    }

    pub fn withdraw_stake(ctx: Context<WithdrawStake>, amount: u64) -> Result<()> {
        let stake_account_positions = &ctx.accounts.stake_account_positions.load()?;
        let stake_account_metadata = &ctx.accounts.stake_account_metadata;
        let stake_account_custody = &ctx.accounts.stake_account_custody;

        let destination_account = &ctx.accounts.destination;
        let signer = &ctx.accounts.payer;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config).unwrap();

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time(config))
            .unwrap();

        if destination_account.owner != *signer.key {
            return Err(error!(ErrorCode::WithdrawToUnauthorizedAccount));
        }

        // Pre-check
        let remaining_balance = stake_account_custody
            .amount
            .checked_sub(amount)
            .ok_or_else(|| error!(ErrorCode::InsufficientWithdrawableBalance))?;
        if utils::risk::validate(
            &stake_account_positions,
            remaining_balance,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )
        .is_err()
        {
            return Err(error!(ErrorCode::InsufficientWithdrawableBalance));
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

    pub fn update_voter_weight(ctx: Context<UpdateVoterWeight>) -> Result<()> {
        let stake_account_positions = &ctx.accounts.stake_account_positions.load()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let voter_record = &mut ctx.accounts.voter_record;

        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config).unwrap();

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time(config))
            .unwrap();

        utils::risk::validate(
            &stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )?;

        let mut voter_weight = 0u64;
        for i in 0..MAX_POSITIONS {
            if stake_account_positions.positions[i].is_some() {
                let position = stake_account_positions.positions[i].unwrap();
                match position.get_current_position(current_epoch, config.unlocking_duration)? {
                    PositionState::LOCKED => {
                        if position.is_voting() {
                            // position.amount is trusted, so I don't think this can overflow,
                            // but still probably better to use checked math
                            voter_weight = voter_weight.checked_add(position.amount).unwrap();
                        }
                    }
                    _ => {}
                }
            }
        }
        voter_record.voter_weight = voter_weight;
        voter_record.voter_weight_expiry = Some(Clock::get()?.slot);
        Ok(())
    }

    pub fn cleanup_positions(ctx: Context<CleanupPositions>) -> Result<()> {
        Ok(())
    }

    // Unfortunately Anchor doesn't seem to allow conditional compilation of an instruction,
    // so we have to keep it, but make it a no-op.
    pub fn advance_clock(ctx: Context<AdvanceClock>, seconds: i64) -> Result<()> {
        #[cfg(feature = "mock-clock")]
        {
            let config = &mut ctx.accounts.config;
            config.mock_clock_time = config.mock_clock_time.checked_add(seconds).unwrap();
            Ok(())
        }
        #[cfg(not(feature = "mock-clock"))]
        {
            return Err(error!(ErrorCode::DebuggingOnly));
        }
    }
}
