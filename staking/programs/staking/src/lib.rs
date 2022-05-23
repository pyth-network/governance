#![deny(unused_must_use)]
#![allow(dead_code)]
#![allow(clippy::upper_case_acronyms)]
// Objects of type Result must be used, otherwise we might
// call a function that returns a Result and not handle the error

use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::borsh::try_from_slice_unchecked;
use anchor_spl::token::transfer;
use context::*;
use spl_governance::state::proposal::ProposalV2;
use state::global_config::GlobalConfig;
use state::max_voter_weight_record::MAX_VOTER_WEIGHT;
use state::positions::{
    Position,
    PositionData,
    PositionState,
    Target,
    TargetWithParameters,
};
use state::vesting::VestingSchedule;
use state::voter_weight_record::VoterWeightAction;
use std::convert::TryInto;
use utils::clock::{
    get_current_epoch,
    time_to_epoch,
};
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


    use std::mem::transmute_copy;

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
        config_account.freeze = global_config.freeze;
        #[cfg(feature = "mock-clock")]
        {
            config_account.mock_clock_time = global_config.mock_clock_time;
        }

        if global_config.epoch_duration == 0 {
            return Err(error!(ErrorCode::ZeroEpochDuration));
        }
        Ok(())
    }

    pub fn update_governance_authority(
        ctx: Context<UpdateGovernanceAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.governance_authority = new_authority;
        Ok(())
    }

    pub fn update_freeze(ctx: Context<UpdateFreeze>, freeze: bool) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.freeze = freeze;
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
        let config = &ctx.accounts.config;
        config.check_frozen()?;

        let stake_account_metadata = &mut ctx.accounts.stake_account_metadata;
        stake_account_metadata.metadata_bump = *ctx.bumps.get("stake_account_metadata").unwrap();
        stake_account_metadata.custody_bump = *ctx.bumps.get("stake_account_custody").unwrap();
        stake_account_metadata.authority_bump = *ctx.bumps.get("custody_authority").unwrap();
        stake_account_metadata.voter_bump = *ctx.bumps.get("voter_record").unwrap();
        stake_account_metadata.owner = owner;
        stake_account_metadata.next_index = 0;

        stake_account_metadata.lock = lock;

        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_init()?;
        stake_account_positions.initialize()?;
        stake_account_positions.owner = owner;

        let voter_record = &mut ctx.accounts.voter_record;

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
        target_with_parameters: TargetWithParameters,
        amount: u64,
    ) -> Result<()> {
        if amount == 0 {
            return Err(error!(ErrorCode::CreatePositionWithZero));
        }

        // TODO: Should we check that target is legitimate?
        // I don't think anyone has anything to gain from adding a position to a fake target
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config)?;
        let target_account = &mut ctx.accounts.target_account;

        config.check_frozen()?;

        let new_position = Position {
            amount,
            target_with_parameters,
            activation_epoch: current_epoch + 1,
            unlocking_start: None,
        };

        match PositionData::reserve_new_index(
            stake_account_positions,
            &mut ctx.accounts.stake_account_metadata.next_index,
        ) {
            Err(x) => return Err(x),
            Ok(i) => {
                stake_account_positions.write_position(i, &new_position)?;
            }
        }

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time(config))?;

        utils::risk::validate(
            stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )?;

        target_account.add_locking(amount, current_epoch)?;

        Ok(())
    }

    pub fn close_position(
        ctx: Context<ClosePosition>,
        index: u8,
        amount: u64,
        target_with_parameters: TargetWithParameters,
    ) -> Result<()> {
        let i: usize = index.try_into().or(Err(ErrorCode::GenericOverflow))?;
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let target_account = &mut ctx.accounts.target_account;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config)?;

        config.check_frozen()?;

        let mut current_position: Position = stake_account_positions.read_position(i)?;

        if current_position.target_with_parameters != target_with_parameters {
            return Err(error!(ErrorCode::WrongTarget));
        }

        let original_amount = current_position.amount;

        let remaining_amount = current_position
            .amount
            .checked_sub(amount)
            .ok_or_else(|| error!(ErrorCode::AmountBiggerThanPosition))?;

        match current_position.get_current_position(current_epoch, config.unlocking_duration)? {
            PositionState::LOCKED => {
                // If remaining amount is 0 keep only 1 position
                if remaining_amount == 0 {
                    current_position.unlocking_start = Some(current_epoch + 1);
                    stake_account_positions.write_position(i, &current_position)?;
                    // Otherwise leave remaining amount in the current position and
                    // create another position with the rest. The newly created position
                    // will unlock after unlocking_duration epochs.

                    assert_eq!(
                        original_amount,
                        stake_account_positions.read_position(i)?.amount
                    );
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.write_position(i, &current_position)?;

                    match PositionData::reserve_new_index(
                        stake_account_positions,
                        &mut ctx.accounts.stake_account_metadata.next_index,
                    ) {
                        Err(x) => return Err(x),
                        Ok(j) => {
                            stake_account_positions.write_position(
                                j,
                                &Position {
                                    amount,
                                    target_with_parameters: current_position.target_with_parameters,
                                    activation_epoch: current_position.activation_epoch,
                                    unlocking_start: Some(current_epoch + 1),
                                },
                            )?;


                            assert_ne!(i, j);
                            assert_eq!(
                                original_amount,
                                stake_account_positions
                                    .read_position(i)?
                                    .amount
                                    .checked_add(stake_account_positions.read_position(j)?.amount)
                                    .ok_or_else(|| error!(ErrorCode::GenericOverflow))?
                            );
                        }
                    }
                }

                target_account.add_unlocking(amount, current_epoch)?;
            }

            // For this case, we don't need to create new positions because the "closed"
            // tokens become "free"
            PositionState::UNLOCKED => {
                if remaining_amount == 0 {
                    stake_account_positions
                        .make_none(i, &mut ctx.accounts.stake_account_metadata.next_index)?;
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.write_position(i, &current_position)?;
                }
            }
            PositionState::LOCKING => {
                if remaining_amount == 0 {
                    stake_account_positions
                        .make_none(i, &mut ctx.accounts.stake_account_metadata.next_index)?;
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.write_position(i, &current_position)?;
                }
                target_account.add_unlocking(amount, current_epoch)?;
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

        config.check_frozen()?;

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
            stake_account_positions,
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

        ctx.accounts.stake_account_custody.reload()?;

        if utils::risk::validate(
            stake_account_positions,
            ctx.accounts.stake_account_custody.amount,
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

    pub fn update_voter_weight(
        ctx: Context<UpdateVoterWeight>,
        action: VoterWeightAction,
    ) -> Result<()> {
        let stake_account_positions = &ctx.accounts.stake_account_positions.load()?;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let voter_record = &mut ctx.accounts.voter_record;
        let config = &ctx.accounts.config;
        let governance_target = &mut ctx.accounts.governance_target;

        let current_epoch = get_current_epoch(config).unwrap();
        governance_target.update(current_epoch)?;

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(utils::clock::get_current_time(config))
            .unwrap();

        utils::risk::validate(
            stake_account_positions,
            stake_account_custody.amount,
            unvested_balance,
            current_epoch,
            config.unlocking_duration,
        )?;

        let epoch_of_snapshot: u64;
        voter_record.weight_action = Some(action);

        match action {
            VoterWeightAction::CastVote => {
                if ctx.remaining_accounts.is_empty() {
                    return Err(error!(ErrorCode::NoRemainingAccount));
                }
                let proposal_account = &ctx.remaining_accounts[0];
                let proposal_data: ProposalV2 =
                    try_from_slice_unchecked(&proposal_account.data.borrow())?;
                let proposal_start = proposal_data
                    .voting_at
                    .ok_or_else(|| error!(ErrorCode::ProposalNotActive))?;
                epoch_of_snapshot = time_to_epoch(config, proposal_start)?;

                voter_record.weight_action_target = Some(*proposal_account.key);
            }
            _ => {
                // The other actions are creating a proposal, comment on a proposal and create
                // governance. It's OK to use current weights for these things.
                // It is also ok to leave weight_action_target as None because we don't
                // need to make any extra checks.
                // For creating a proposal weight_action_target is supposed to be the governance
                // but we don't have specific logic for different governances
                // For creating a governance weight_action_target is supposed to be the realm
                // but we have a single realm.
                epoch_of_snapshot = current_epoch;
                voter_record.weight_action_target = None;
            }
        }

        if !((current_epoch <= epoch_of_snapshot + 1) && (epoch_of_snapshot <= current_epoch)) {
            return Err(error!(ErrorCode::InvalidVotingEpoch));
        }

        voter_record.voter_weight = compute_voter_weight(
            stake_account_positions,
            epoch_of_snapshot,
            config.unlocking_duration,
            governance_target.get_current_amount_locked(epoch_of_snapshot)?,
            MAX_VOTER_WEIGHT,
        )?;
        voter_record.voter_weight_expiry = Some(Clock::get()?.slot);

        Ok(())
    }

    pub fn update_max_voter_weight(ctx: Context<UpdateMaxVoterWeight>) -> Result<()> {
        let config = &ctx.accounts.config;
        let max_voter_record = &mut ctx.accounts.max_voter_record;

        max_voter_record.realm = config.pyth_governance_realm;
        max_voter_record.governing_token_mint = config.pyth_token_mint;
        max_voter_record.max_voter_weight = MAX_VOTER_WEIGHT;
        max_voter_record.max_voter_weight_expiry = None; // never expires
        Ok(())
    }

    pub fn create_target(ctx: Context<CreateTarget>, target: Target) -> Result<()> {
        let target_account = &mut ctx.accounts.target_account;
        let config = &ctx.accounts.config;

        if !(matches!(target, Target::VOTING)) {
            return Err(error!(ErrorCode::NotImplemented));
        }

        target_account.bump = *ctx.bumps.get("target_account").unwrap();
        target_account.last_update_at = get_current_epoch(config).unwrap();
        target_account.prev_epoch_locked = 0;
        target_account.locked = 0;
        target_account.delta_locked = 0;
        Ok(())
    }

    pub fn upgrade_stake_account_metadata(ctx: Context<UpgradeStakeAccountMetadata>) -> Result<()> {
        let mut stake_account_positions = ctx.accounts.stake_account_positions.load_mut()?;
        let v1_metadata = &ctx.accounts.stake_account_metadata_v1;
        if ctx.remaining_accounts.len() != 1 {
            return Err(error!(ErrorCode::AccountUpgradeFailed));
        }
        // Even though this is a raw AccountInfo, it's the same account as v1_metadata, so we know
        // the owner is this program
        let v2_version = &ctx.remaining_accounts[0];
        if !v2_version.is_writable {
            return Err(error!(ErrorCode::AccountUpgradeFailed));
        }
        if *v2_version.key != v1_metadata.key() {
            return Err(error!(ErrorCode::AccountUpgradeFailed));
        }
        // First count how many are used
        let mut used_count = 0usize;
        for i in 0..MAX_POSITIONS {
            unsafe {
                let v1_position: Option<Position> =
                    transmute_copy(&stake_account_positions.positions[i]);
                if v1_position.is_some() {
                    v1_position.try_write(&mut stake_account_positions.positions[used_count])?;
                    used_count += 1;
                }
            }
        }
        // From that position all, write all None's
        for i in used_count..MAX_POSITIONS {
            None.try_write(&mut stake_account_positions.positions[i])?
        }
        let upgraded = v1_metadata.as_v2(
            used_count
                .try_into()
                .map_err(|_| error!(ErrorCode::GenericOverflow))?,
        );
        let mut acct_data = v2_version.try_borrow_mut_data()?;
        // Scary! This overwrites the discriminator and then writes the data
        upgraded.try_serialize(&mut *acct_data)?;

        Ok(())
    }

    // Unfortunately Anchor doesn't seem to allow conditional compilation of an instruction,
    // so we have to keep it, but make it a no-op.
    #[allow(unused_variables)]
    pub fn advance_clock(ctx: Context<AdvanceClock>, seconds: i64) -> Result<()> {
        #[cfg(feature = "mock-clock")]
        {
            let config = &mut ctx.accounts.config;
            config.mock_clock_time = config.mock_clock_time.checked_add(seconds).unwrap();
            Ok(())
        }
        #[cfg(not(feature = "mock-clock"))]
        {
            Err(error!(ErrorCode::DebuggingOnly))
        }
    }
}
