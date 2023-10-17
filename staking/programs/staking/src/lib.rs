#![deny(unused_must_use)]
#![allow(dead_code)]
#![allow(clippy::upper_case_acronyms)]
#![allow(clippy::result_large_err)]
// Objects of type Result must be used, otherwise we might
// call a function that returns a Result and not handle the error

use {
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token::transfer,
    context::*,
    spl_governance::state::{
        governance::get_governance_data_for_realm,
        proposal::{
            get_proposal_data,
            ProposalV2,
        },
    },
    state::{
        global_config::GlobalConfig,
        max_voter_weight_record::MAX_VOTER_WEIGHT,
        positions::{
            Position,
            PositionData,
            PositionState,
            Target,
            TargetWithParameters,
        },
        vesting::VestingSchedule,
        voter_weight_record::VoterWeightAction,
    },
    std::convert::TryInto,
    utils::{
        clock::{
            get_current_epoch,
            time_to_epoch,
        },
        voter_weight::compute_voter_weight,
    },
};

mod context;
mod error;
mod state;
mod utils;
#[cfg(feature = "wasm")]
pub mod wasm;

declare_id!("pytS9TjG1qyAZypk7n8rw8gfW9sUaqqYyMhJQ4E7JCQ");
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
        config_account.freeze = global_config.freeze;
        config_account.pda_authority = global_config.pda_authority;
        config_account.governance_program = global_config.governance_program;
        config_account.pyth_token_list_time = None;

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

    pub fn update_token_list_time(
        ctx: Context<UpdateTokenListTime>,
        token_list_time: Option<i64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.pyth_token_list_time = token_list_time;
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
        stake_account_metadata.transfer_epoch = None;

        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_init()?;
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

        let i = PositionData::reserve_new_index(
            stake_account_positions,
            &mut ctx.accounts.stake_account_metadata.next_index,
        )?;
        stake_account_positions.write_position(i, &new_position)?;

        let unvested_balance = ctx
            .accounts
            .stake_account_metadata
            .lock
            .get_unvested_balance(
                utils::clock::get_current_time(config),
                config.pyth_token_list_time,
            )?;

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
        if amount == 0 {
            return Err(error!(ErrorCode::ClosePositionWithZero));
        }

        let i: usize = index.try_into().or(Err(ErrorCode::GenericOverflow))?;
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let target_account = &mut ctx.accounts.target_account;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config)?;

        config.check_frozen()?;

        let mut current_position: Position = stake_account_positions
            .read_position(i)?
            .ok_or_else(|| error!(ErrorCode::PositionNotInUse))?;

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
                        stake_account_positions
                            .read_position(i)?
                            .ok_or_else(|| error!(ErrorCode::PositionNotInUse))?
                            .amount
                    );
                } else {
                    current_position.amount = remaining_amount;
                    stake_account_positions.write_position(i, &current_position)?;

                    let j = PositionData::reserve_new_index(
                        stake_account_positions,
                        &mut ctx.accounts.stake_account_metadata.next_index,
                    )?;
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
                            .ok_or_else(|| error!(ErrorCode::PositionNotInUse))?
                            .amount
                            .checked_add(
                                stake_account_positions
                                    .read_position(j)?
                                    .ok_or_else(|| error!(ErrorCode::PositionNotInUse))?
                                    .amount
                            )
                            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?
                    );
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
            .get_unvested_balance(
                utils::clock::get_current_time(config),
                config.pyth_token_list_time,
            )
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
            .get_unvested_balance(
                utils::clock::get_current_time(config),
                config.pyth_token_list_time,
            )
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
                let proposal_account: &AccountInfo = ctx
                    .remaining_accounts
                    .get(0)
                    .ok_or_else(|| error!(ErrorCode::NoRemainingAccount))?;

                let proposal_data: ProposalV2 =
                    get_proposal_data(&config.governance_program, proposal_account)?;

                let proposal_start = proposal_data
                    .voting_at
                    .ok_or_else(|| error!(ErrorCode::ProposalNotActive))?;

                if let Some(max_voting_time) = proposal_data.max_voting_time {
                    if config.epoch_duration < max_voting_time.into() {
                        return Err(error!(ErrorCode::ProposalTooLong));
                    }
                }

                epoch_of_snapshot = time_to_epoch(config, proposal_start)?;
                voter_record.weight_action_target = Some(*proposal_account.key);
            }
            VoterWeightAction::CreateProposal => {
                let governance_account: &AccountInfo = ctx
                    .remaining_accounts
                    .get(0)
                    .ok_or_else(|| error!(ErrorCode::NoRemainingAccount))?;

                let governance_data = get_governance_data_for_realm(
                    &config.governance_program,
                    governance_account,
                    &config.pyth_governance_realm,
                )?;

                if config.epoch_duration < governance_data.config.max_voting_time.into() {
                    return Err(error!(ErrorCode::ProposalTooLong));
                }

                epoch_of_snapshot = current_epoch;
                voter_record.weight_action_target = Some(*governance_account.key);
            }
            _ => {
                // The other actions are comment on a proposal and create
                // governance. It's OK to use current weights for these things.
                // It is also ok to leave weight_action_target as None because we don't
                // need to make any extra checks.
                // For creating a governance weight_action_target is supposed to be the realm
                // but we have a single realm.
                epoch_of_snapshot = current_epoch;
                voter_record.weight_action_target = None;
            }
        }

        if !((current_epoch <= epoch_of_snapshot + 1) && (epoch_of_snapshot <= current_epoch)) {
            return Err(error!(ErrorCode::InvalidVotingEpoch));
        }

        if let Some(transfer_epoch) = ctx.accounts.stake_account_metadata.transfer_epoch {
            if epoch_of_snapshot <= transfer_epoch {
                return Err(error!(ErrorCode::VoteDuringTransferEpoch));
            }
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

    // Unfortunately Anchor doesn't seem to allow conditional compilation of an instruction,
    // so we have to keep it, but make it a no-op.
    #[allow(unused_variables)]
    pub fn advance_clock(ctx: Context<AdvanceClock>, seconds: i64) -> Result<()> {
        #[cfg(feature = "mock-clock")]
        {
            let config = &mut ctx.accounts.config;
            config.mock_clock_time = config.mock_clock_time.checked_add(seconds).unwrap();
            // This assert can't possibly fail, but this gets the string "MOCK_CLOCK_ENABLED"
            // into the binary. Before we deploy, we check for this string and abort the deployment.
            assert!(config.mock_clock_time.to_string() != "MOCK_CLOCK_ENABLED");
            Ok(())
        }
        #[cfg(not(feature = "mock-clock"))]
        {
            Err(error!(ErrorCode::DebuggingOnly))
        }
    }

    /**
     * Any user of the staking program can request to split their account and
     * give a part of it to another user. This is mostly useful to transfer unvested
     * tokens.
     * In the first step, the user requests a split by specifying the `amount` of tokens
     * they want to give to the other user and the `recipient`'s pubkey.
     */
    pub fn request_split(ctx: Context<RequestSplit>, amount: u64, recipient: Pubkey) -> Result<()> {
        ctx.accounts.stake_account_split_request.amount = amount;
        ctx.accounts.stake_account_split_request.recipient = recipient;
        Ok(())
    }


    /**
     * A split request can only be accepted by the `pda_authority`` from
     * the config account. If accepted, `amount` tokens are transferred to a new stake account
     * owned by the `recipient` and the split request is reset (by setting `amount` to 0).
     * The recipient of a transfer can't vote during the epoch of the transfer.
     */
    pub fn accept_split(ctx: Context<AcceptSplit>) -> Result<()> {
        // TODO : Split vesting schedule between both accounts

        // TODO : Transfer stake positions to the new account if need

        // TODO Check both accounts are valid after the transfer

        // Transfer tokens
        {
            let split_request = &ctx.accounts.source_stake_account_split_request;
            transfer(
                CpiContext::from(&*ctx.accounts).with_signer(&[&[
                    AUTHORITY_SEED.as_bytes(),
                    ctx.accounts.source_stake_account_positions.key().as_ref(),
                    &[ctx.accounts.source_stake_account_metadata.authority_bump],
                ]]),
                split_request.amount,
            )?;
        }

        // Delete current request
        {
            ctx.accounts.source_stake_account_split_request.amount = 0;
        }
        err!(ErrorCode::NotImplemented)
    }
}
