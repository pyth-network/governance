#![deny(unused_must_use)]
// Objects of type Result must be used, otherwise we might
// call a function that returns a Result and not handle the error

use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::log;
use anchor_spl::token::transfer;
use context::*;
use state::global_config::GlobalConfig;
use state::positions::{
    Position,
    PositionData,
    PositionState,
    MAX_POSITIONS,
};
use state::vesting::VestingSchedule;
use utils::clock::get_current_epoch;
use utils::voter_weight::compute_voter_weight;

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
    /// The main account i.e. the position accounts needs to be initialized outside of the program
    /// otherwise we run into stack limits
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
        let product_account = &mut ctx.accounts.product_account;

        // Make sure both are Some() or both are None
        if product.is_none() != publisher.is_none() {
            return Err(error!(ErrorCode::InvalidPosition));
        }
        let new_position = Position {
            amount:           amount,
            product:          product,
            publisher:        publisher,
            activation_epoch: current_epoch + 1,
            unlocking_start:  None,
        };
        // For now, restrict positions to voting position
        // This could be combined with the previous check, but the following check is temporary
        if !new_position.is_voting() {
            return Err(error!(ErrorCode::NotImplemented));
        }

        match PositionData::get_unused_index(stake_account_positions) {
            Err(x) => return Err(x),
            Ok(i) => {
                stake_account_positions.positions[i] = Some(new_position);
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

        product_account.add_locking(amount, current_epoch)?;

        Ok(())
    }

    pub fn close_position(
        ctx: Context<ClosePosition>,
        index: u8,
        amount: u64,
        product: Option<Pubkey>,
    ) -> Result<()> {
        let i = index as usize;
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let product_account = &mut ctx.accounts.product_account;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config)?;

        let current_position =
            &mut stake_account_positions.positions[i].ok_or(error!(ErrorCode::PositionNotInUse))?;

        if current_position.product != product {
            return Err(error!(ErrorCode::WrongProduct));
        }

        let original_amount = current_position.amount;

        let remaining_amount = current_position
            .amount
            .checked_sub(amount)
            .ok_or(error!(ErrorCode::AmountBiggerThanPosition))?;

        match current_position.get_current_position(current_epoch, config.unlocking_duration)? {
            PositionState::LOCKED => {
                // If remaining amount is 0 keep only 1 position
                if remaining_amount == 0 {
                    current_position.unlocking_start = Some(current_epoch + 1);
                    stake_account_positions.positions[i] = Some(*current_position);
                    // Otherwise leave remaining amount in the current position and
                    // create another position with the rest. The newly created position
                    // will unlock after unlocking_duration epochs.

                    assert_eq!(
                        original_amount,
                        stake_account_positions.positions[i]
                            .ok_or(error!(ErrorCode::PositionNotInUse))?
                            .amount
                    );
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.positions[i] = Some(*current_position);

                    match PositionData::get_unused_index(stake_account_positions) {
                        Err(x) => return Err(x),
                        Ok(j) => {
                            stake_account_positions.positions[j] = Some(Position {
                                amount:           amount,
                                product:          current_position.product,
                                publisher:        current_position.publisher,
                                activation_epoch: current_position.activation_epoch,
                                unlocking_start:  Some(current_epoch + 1),
                            });

                            assert_ne!(i, j);
                            assert_eq!(
                                original_amount,
                                stake_account_positions.positions[i]
                                    .ok_or(error!(ErrorCode::PositionNotInUse))?
                                    .amount
                                    .checked_add(
                                        stake_account_positions.positions[j]
                                            .ok_or(error!(ErrorCode::PositionNotInUse))?
                                            .amount
                                    )
                                    .ok_or(error!(ErrorCode::GenericOverflow))?
                            );
                        }
                    }
                }

                product_account.add_unlocking(amount, current_epoch)?;
            }

            // For this case, we don't need to create new positions because the "closed"
            // tokens become "free"
            PositionState::UNLOCKED => {
                if remaining_amount == 0 {
                    stake_account_positions.positions[i] = None;
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.positions[i] = Some(*current_position);
                }
            }
            PositionState::LOCKING => {
                if remaining_amount == 0 {
                    stake_account_positions.positions[i] = None;
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.positions[i] = Some(*current_position);
                }
                product_account.add_unlocking(amount, current_epoch)?;
            }
            PositionState::UNLOCKING | PositionState::PREUNLOCKING => {
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

        voter_record.voter_weight = compute_voter_weight(
            stake_account_positions,
            current_epoch,
            config.unlocking_duration,
        )?;
        voter_record.voter_weight_expiry = Some(Clock::get()?.slot);
        Ok(())
    }

    pub fn update_max_voter_weight(ctx: Context<UpdateMaxVoterWeight>) -> Result<()> {
        let governance_account = &mut ctx.accounts.governance_account;
        let config = &ctx.accounts.config;
        let max_voter_record = &mut ctx.accounts.max_voter_record;
        let current_epoch = get_current_epoch(config)?;

        governance_account.update(current_epoch)?;
        max_voter_record.realm = config.pyth_governance_realm;
        max_voter_record.governing_token_mint = config.pyth_token_mint;
        max_voter_record.max_voter_weight = governance_account.locked;
        max_voter_record.max_voter_weight_expiry = Some(Clock::get()?.slot);
        Ok(())
    }

    pub fn cleanup_positions(ctx: Context<CleanupPositions>) -> Result<()> {
        Ok(())
    }

    pub fn create_product(ctx: Context<CreateProduct>, product: Option<Pubkey>) -> Result<()> {
        let product_account = &mut ctx.accounts.product_account;
        let config = &ctx.accounts.config;

        if product.is_some() {
            return Err(error!(ErrorCode::NotImplemented));
        }

        product_account.bump = *ctx.bumps.get("product_account").unwrap();
        product_account.last_update_at = get_current_epoch(config).unwrap();
        product_account.locked = 0;
        product_account.delta_locked = 0;
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
