#![deny(unused_must_use)]
#![allow(dead_code)]
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
        risk::calculate_governance_exposure,
        voter_weight::compute_voter_weight,
    },
};


pub mod context;
pub mod error;
pub mod state;
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
        config_account.bump = ctx.bumps.config_account;
        config_account.governance_authority = global_config.governance_authority;
        config_account.pyth_token_mint = global_config.pyth_token_mint;
        config_account.pyth_governance_realm = global_config.pyth_governance_realm;
        config_account.unlocking_duration = global_config.unlocking_duration;
        config_account.epoch_duration = global_config.epoch_duration;
        config_account.freeze = global_config.freeze;
        config_account.pda_authority = global_config.pda_authority;
        config_account.governance_program = global_config.governance_program;
        config_account.pyth_token_list_time = None;
        config_account.agreement_hash = global_config.agreement_hash;
        config_account.pool_authority = global_config.pool_authority;

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

    pub fn update_pda_authority(
        ctx: Context<UpdatePdaAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.pda_authority = new_authority;
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

    pub fn update_agreement_hash(
        ctx: Context<UpdateAgreementHash>,
        agreement_hash: [u8; 32],
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.agreement_hash = agreement_hash;
        Ok(())
    }

    pub fn update_pool_authority(
        ctx: Context<UpdatePoolAuthority>,
        pool_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.pool_authority = pool_authority;
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
        stake_account_metadata.initialize(
            ctx.bumps.stake_account_metadata,
            ctx.bumps.stake_account_custody,
            ctx.bumps.custody_authority,
            &owner,
        );
        stake_account_metadata.set_lock(lock);

        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_init()?;
        stake_account_positions.initialize(&owner);

        Ok(())
    }

    pub fn create_voter_record(ctx: Context<CreateVoterRecord>) -> Result<()> {
        let config = &ctx.accounts.config;
        let voter_record = &mut ctx.accounts.voter_record;
        let stake_account_metadata = &mut ctx.accounts.stake_account_metadata;

        stake_account_metadata.voter_bump = ctx.bumps.voter_record;
        voter_record.initialize(config, &stake_account_metadata.owner);

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
        let maybe_target_account = &mut ctx.accounts.target_account;

        if target_with_parameters == TargetWithParameters::Voting {
            require!(
                maybe_target_account.is_some(),
                ErrorCode::MissingTargetAccount,
            )
        }

        if let TargetWithParameters::IntegrityPool { .. } = target_with_parameters {
            require!(
                ctx.accounts
                    .pool_authority
                    .as_ref()
                    .map_or(false, |x| x.key() == config.pool_authority),
                ErrorCode::InvalidPoolAuthority
            )
        }

        ctx.accounts
            .stake_account_metadata
            .check_is_llc_member(&config.agreement_hash)?;

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
        )?;

        if let Some(target_account) = maybe_target_account {
            target_account.add_locking(amount, current_epoch)?;
        }

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


        let i: usize = index.into();
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let config = &ctx.accounts.config;
        let current_epoch = get_current_epoch(config)?;
        let maybe_target_account = &mut ctx.accounts.target_account;

        if target_with_parameters == TargetWithParameters::Voting {
            require!(
                maybe_target_account.is_some(),
                ErrorCode::MissingTargetAccount,
            )
        }

        if let TargetWithParameters::IntegrityPool { .. } = target_with_parameters {
            require!(
                ctx.accounts
                    .pool_authority
                    .as_ref()
                    .map_or(false, |x| x.key() == config.pool_authority),
                ErrorCode::InvalidPoolAuthority
            )
        }
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

                if let Some(target_account) = maybe_target_account {
                    target_account.add_unlocking(amount, current_epoch)?;
                }
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
                if let Some(target_account) = maybe_target_account {
                    target_account.add_unlocking(amount, current_epoch)?;
                }
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
        let signer = &ctx.accounts.owner;
        let config = &ctx.accounts.config;


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
        if utils::risk::validate(stake_account_positions, remaining_balance, unvested_balance)
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

        ctx.accounts
            .stake_account_metadata
            .check_is_llc_member(&config.agreement_hash)?;

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
        )?;

        let epoch_of_snapshot: u64;
        voter_record.weight_action = Some(action);

        match action {
            VoterWeightAction::CastVote => {
                let proposal_account: &AccountInfo = ctx
                    .remaining_accounts
                    .first()
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
                    .first()
                    .ok_or_else(|| error!(ErrorCode::NoRemainingAccount))?;

                let governance_data = get_governance_data_for_realm(
                    &config.governance_program,
                    governance_account,
                    &config.pyth_governance_realm,
                )?;

                if config.epoch_duration < governance_data.config.voting_base_time.into() {
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

    pub fn create_target(ctx: Context<CreateTarget>) -> Result<()> {
        let target_account = &mut ctx.accounts.target_account;
        let config = &ctx.accounts.config;

        target_account.bump = ctx.bumps.target_account;
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
     * give a part of it to another user.
     * This is mostly useful to transfer unvested tokens. Each user can only have one active
     * request at a time.
     * In the first step, the user requests a split by specifying the `amount` of tokens
     * they want to give to the other user and the `recipient`'s pubkey.
     */
    pub fn request_split(ctx: Context<RequestSplit>, amount: u64, recipient: Pubkey) -> Result<()> {
        ctx.accounts.stake_account_split_request.amount = amount;
        ctx.accounts.stake_account_split_request.recipient = recipient;
        Ok(())
    }


    /**
     * A split request can only be accepted by the `pda_authority` from
     * the config account. If accepted, `amount` tokens are transferred to a new stake account
     * owned by the `recipient` and the split request is reset (by setting `amount` to 0).
     * The recipient of a transfer can't vote during the epoch of the transfer.
     *
     * The `pda_authority` must explicitly approve both the amount of tokens and recipient, and
     * these parameters must match the request (in the `split_request` account).
     */
    pub fn accept_split(ctx: Context<AcceptSplit>, amount: u64, recipient: Pubkey) -> Result<()> {
        let config = &ctx.accounts.config;

        let split_request = &ctx.accounts.source_stake_account_split_request;
        require!(
            split_request.amount == amount && split_request.recipient == recipient,
            ErrorCode::InvalidApproval
        );

        // Initialize new accounts
        ctx.accounts.new_stake_account_metadata.initialize(
            ctx.bumps.new_stake_account_metadata,
            ctx.bumps.new_stake_account_custody,
            ctx.bumps.new_custody_authority,
            &split_request.recipient,
        );

        let new_stake_account_positions =
            &mut ctx.accounts.new_stake_account_positions.load_init()?;
        new_stake_account_positions.initialize(&split_request.recipient);

        // Pre-check invariants
        // Note that the accept operation requires the positions account to be empty, which should
        // trivially pass this invariant check. However, we explicitly check invariants
        // everywhere else, so may as well check in this operation also.
        let source_stake_account_positions =
            &mut ctx.accounts.source_stake_account_positions.load_mut()?;
        utils::risk::validate(
            source_stake_account_positions,
            ctx.accounts.source_stake_account_custody.amount,
            ctx.accounts
                .source_stake_account_metadata
                .lock
                .get_unvested_balance(
                    utils::clock::get_current_time(config),
                    config.pyth_token_list_time,
                )?,
        )?;

        // Check that there aren't any positions (i.e., staked tokens) in the source account.
        // This check allows us to create an empty positions account on behalf of the recipient and
        // not worry about moving positions from the source account to the new account.
        require!(
            ctx.accounts.source_stake_account_metadata.next_index == 0,
            ErrorCode::SplitWithStake
        );

        require!(split_request.amount > 0, ErrorCode::SplitZeroTokens);

        // Split vesting account
        let (source_vesting_schedule, new_vesting_schedule) = ctx
            .accounts
            .source_stake_account_metadata
            .lock
            .split_vesting_schedule(
                split_request.amount,
                ctx.accounts.source_stake_account_custody.amount,
            )?;
        ctx.accounts
            .source_stake_account_metadata
            .set_lock(source_vesting_schedule);
        ctx.accounts
            .new_stake_account_metadata
            .set_lock(new_vesting_schedule);


        transfer(
            CpiContext::from(&*ctx.accounts).with_signer(&[&[
                AUTHORITY_SEED.as_bytes(),
                ctx.accounts.source_stake_account_positions.key().as_ref(),
                &[ctx.accounts.source_stake_account_metadata.authority_bump],
            ]]),
            split_request.amount,
        )?;

        ctx.accounts.source_stake_account_custody.reload()?;
        ctx.accounts.new_stake_account_custody.reload()?;


        // Post-check
        utils::risk::validate(
            source_stake_account_positions,
            ctx.accounts.source_stake_account_custody.amount,
            ctx.accounts
                .source_stake_account_metadata
                .lock
                .get_unvested_balance(
                    utils::clock::get_current_time(config),
                    config.pyth_token_list_time,
                )?,
        )?;

        utils::risk::validate(
            new_stake_account_positions,
            ctx.accounts.new_stake_account_custody.amount,
            ctx.accounts
                .new_stake_account_metadata
                .lock
                .get_unvested_balance(
                    utils::clock::get_current_time(config),
                    config.pyth_token_list_time,
                )?,
        )?;

        // Delete current request
        ctx.accounts.source_stake_account_split_request.amount = 0;

        Ok(())
    }

    /**
     * Accept to join the DAO LLC
     * This must happen before create_position or update_voter_weight
     * The user signs a hash of the agreement and the program checks that the hash matches the
     * agreement
     */
    pub fn join_dao_llc(ctx: Context<JoinDaoLlc>, _agreement_hash: [u8; 32]) -> Result<()> {
        ctx.accounts.stake_account_metadata.signed_agreement_hash =
            Some(ctx.accounts.config.agreement_hash);
        Ok(())
    }

    /** Recovers a user's `stake account` ownership by transferring ownership
     * from a token account to the `owner` of that token account.
     *
     * This functionality addresses the scenario where a user mistakenly
     * created a stake account using their token account address as the owner.
     */
    pub fn recover_account(ctx: Context<RecoverAccount>) -> Result<()> {
        // Check that there aren't any positions (i.e., staked tokens) in the account.
        // Transferring accounts with staked tokens might lead to double voting
        require!(
            ctx.accounts.stake_account_metadata.next_index == 0,
            ErrorCode::RecoverWithStake
        );

        let new_owner = ctx.accounts.owner.owner;

        ctx.accounts.stake_account_metadata.owner = new_owner;
        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        stake_account_positions.owner = new_owner;
        ctx.accounts.voter_record.governing_token_owner = new_owner;

        Ok(())
    }

    pub fn slash_account(
        ctx: Context<SlashAccount>,
        // a number between 0 and 1 with 6 decimals of precision
        // TODO: use fract64 instead of u64
        slash_ratio: u64,
    ) -> Result<(u64, u64, u64)> {
        require_gte!(1_000_000, slash_ratio, ErrorCode::InvalidSlashRatio);

        let stake_account_positions = &mut ctx.accounts.stake_account_positions.load_mut()?;
        let governance_target_account = &mut ctx.accounts.governance_target_account;
        let publisher = &ctx.accounts.publisher;

        let next_index = &mut ctx.accounts.stake_account_metadata.next_index;

        let current_epoch = get_current_epoch(&ctx.accounts.config)?;
        let unlocking_duration = ctx.accounts.config.unlocking_duration;

        let mut locked_slashed = 0;
        let mut unlocking_slashed = 0;
        let mut preunlocking_slashed = 0;

        let mut i: usize = 0;
        while i < usize::from(*next_index) {
            let position = stake_account_positions.read_position(i)?;

            if let Some(position_data) = position {
                let prev_state =
                    position_data.get_current_position(current_epoch - 1, unlocking_duration)?;
                let current_state =
                    position_data.get_current_position(current_epoch, unlocking_duration)?;
                if matches!(
                    position_data.target_with_parameters,
                    TargetWithParameters::IntegrityPool { publisher: publisher_pubkey } if publisher_pubkey == *publisher.key,
                ) && (prev_state == PositionState::LOCKED
                    || prev_state == PositionState::PREUNLOCKING)
                {
                    // TODO: use constants
                    let to_slash: u64 =
                        ((u128::from(position_data.amount) * u128::from(slash_ratio)) / 1_000_000)
                            .try_into()?;

                    match current_state {
                        PositionState::LOCKED => {
                            locked_slashed += to_slash;
                        }
                        PositionState::UNLOCKING => {
                            unlocking_slashed += to_slash;
                        }
                        PositionState::PREUNLOCKING => {
                            preunlocking_slashed += to_slash;
                        }
                        _ => {
                            return Err(error!(ErrorCode::InvalidPosition));
                        }
                    }

                    // position_data.amount >= to_slash since slash_ratio is between 0 and 1
                    if position_data.amount - to_slash == 0 {
                        stake_account_positions.make_none(i, next_index)?;
                        continue;
                    } else {
                        stake_account_positions.write_position(
                            i,
                            &Position {
                                amount:                 position_data.amount - to_slash,
                                target_with_parameters: position_data.target_with_parameters,
                                activation_epoch:       position_data.activation_epoch,
                                unlocking_start:        position_data.unlocking_start,
                            },
                        )?;
                    }
                }
            }
            i += 1;
        }

        let total_amount = ctx.accounts.stake_account_custody.amount;
        let governance_exposure = calculate_governance_exposure(stake_account_positions)?;

        let total_slashed = locked_slashed + unlocking_slashed + preunlocking_slashed;
        if let Some(mut remaining) = (governance_exposure + total_slashed).checked_sub(total_amount)
        {
            let mut i = 0;
            while i < usize::from(*next_index) && remaining > 0 {
                if let Some(position) = stake_account_positions.read_position(i)? {
                    let prev_state =
                        position.get_current_position(current_epoch - 1, unlocking_duration)?;
                    let current_state =
                        position.get_current_position(current_epoch, unlocking_duration)?;

                    if position.target_with_parameters == TargetWithParameters::Voting {
                        let to_slash = remaining.min(position.amount);
                        remaining -= to_slash;

                        match prev_state {
                            PositionState::LOCKED | PositionState::PREUNLOCKING => {
                                governance_target_account
                                    .sub_prev_locked(to_slash, current_epoch)?;
                            }
                            PositionState::LOCKING
                            | PositionState::UNLOCKING
                            | PositionState::UNLOCKED => {}
                        }

                        match current_state {
                            PositionState::LOCKING => {
                                governance_target_account.add_unlocking(to_slash, current_epoch)?;
                            }
                            PositionState::LOCKED => {
                                governance_target_account.sub_locked(to_slash, current_epoch)?;
                            }
                            PositionState::PREUNLOCKING => {
                                governance_target_account.sub_locked(to_slash, current_epoch)?;
                                governance_target_account.add_locking(to_slash, current_epoch)?;
                            }
                            PositionState::UNLOCKING | PositionState::UNLOCKED => {}
                        }

                        if to_slash == position.amount {
                            stake_account_positions.make_none(i, next_index)?;
                            continue;
                        } else {
                            stake_account_positions.write_position(
                                i,
                                &Position {
                                    amount:                 position.amount - to_slash,
                                    target_with_parameters: position.target_with_parameters,
                                    activation_epoch:       position.activation_epoch,
                                    unlocking_start:        position.unlocking_start,
                                },
                            )?;
                        }
                    }
                }
                i += 1;
            }
        }

        transfer(
            CpiContext::from(&*ctx.accounts).with_signer(&[&[
                AUTHORITY_SEED.as_bytes(),
                ctx.accounts.stake_account_positions.key().as_ref(),
                &[ctx.accounts.stake_account_metadata.authority_bump],
            ]]),
            total_slashed,
        )?;

        Ok((locked_slashed, preunlocking_slashed, unlocking_slashed))
    }

    // Hack to allow exporting the Position type in the IDL
    pub fn export_position_type(_ctx: Context<InitConfig>, _position: Position) -> Result<()> {
        Ok(())
    }
}
