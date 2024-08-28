use {
    anchor_lang::prelude::*,
    context::*,
    error::IntegrityPoolError,
    staking::state::positions::{
        DynamicPositionArray,
        TargetWithParameters,
    },
    utils::{
        clock::get_current_epoch,
        constants::{
            MAX_PUBLISHERS,
            POOL_CONFIG,
        },
        types::{
            frac64,
            FRAC_64_MULTIPLIER,
        },
    },
};

mod context;
pub mod error;
pub mod state;
pub mod utils;

declare_id!("BiJszJY5BfRKkvt818SAbY9z9cJLp2jYDPgG2BzsufiE");

#[program]
pub mod integrity_pool {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        reward_program_authority: Pubkey,
        pyth_token_mint: Pubkey,
        y: frac64,
    ) -> Result<()> {
        require_gte!(FRAC_64_MULTIPLIER / 100, y, IntegrityPoolError::InvalidY);

        let pool_config = &mut ctx.accounts.pool_config;
        pool_config.pool_data = ctx.accounts.pool_data.key();
        pool_config.reward_program_authority = reward_program_authority;
        pool_config.pyth_token_mint = pyth_token_mint;
        pool_config.y = y;

        let mut pool_data = ctx.accounts.pool_data.load_init()?;
        pool_data.last_updated_epoch = get_current_epoch()?;

        Ok(())
    }

    pub fn update_y(ctx: Context<UpdateY>, y: frac64) -> Result<()> {
        require_gte!(FRAC_64_MULTIPLIER / 100, y, IntegrityPoolError::InvalidY);

        ctx.accounts.pool_config.y = y;
        Ok(())
    }

    pub fn update_delegation_fee(
        ctx: Context<UpdateDelegationFee>,
        delegation_fee: frac64,
    ) -> Result<()> {
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;

        require_gte!(
            FRAC_64_MULTIPLIER,
            delegation_fee,
            IntegrityPoolError::InvalidDelegationFee
        );

        for publisher_index in 0..MAX_PUBLISHERS {
            pool_data.delegation_fees[publisher_index] = delegation_fee;
        }

        Ok(())
    }

    pub fn delegate(ctx: Context<Delegate>, amount: u64) -> Result<()> {
        let owner = ctx.accounts.owner.clone();
        let pool_config = &ctx.accounts.pool_config;
        let publisher = &ctx.accounts.publisher;
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;

        let config_account = ctx.accounts.config_account.clone();
        let staking_program = &ctx.accounts.staking_program;
        let stake_account_positions = ctx.accounts.stake_account_positions.clone();
        let stake_account_metadata = ctx.accounts.stake_account_metadata.clone();
        let stake_account_custody = ctx.accounts.stake_account_custody.clone();
        let system_program = ctx.accounts.system_program.to_account_info();


        let target_with_parameters =
            staking::state::positions::TargetWithParameters::IntegrityPool {
                publisher: publisher.key(),
            };

        let cpi_accounts = staking::cpi::accounts::CreatePosition {
            config: config_account,
            stake_account_positions,
            stake_account_metadata,
            stake_account_custody,
            owner: owner.to_account_info(),
            target_account: None,
            pool_authority: Some(pool_config.to_account_info()),
            system_program,
        };

        let signer_seeds: &[&[&[u8]]] = &[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]];
        let cpi_ctx = CpiContext::new(staking_program.to_account_info(), cpi_accounts)
            .with_signer(signer_seeds);
        staking::cpi::create_position(cpi_ctx, target_with_parameters, amount)?;

        // update publisher accounting
        pool_data.add_delegation(
            publisher.key,
            &ctx.accounts.stake_account_positions.key(),
            amount,
            get_current_epoch()?,
        )?;

        Ok(())
    }

    pub fn merge_delegation_positions(ctx: Context<MergeDelegationPositions>) -> Result<()> {
        let publisher = ctx.accounts.publisher.key();
        let pool_data = &mut ctx.accounts.pool_data.load()?;
        let delegation_record = &ctx.accounts.delegation_record;

        let owner = ctx.accounts.owner.to_account_info();
        let pool_config = ctx.accounts.pool_config.to_account_info();
        let staking_program = ctx.accounts.staking_program.to_account_info();
        let config_account = ctx.accounts.config_account.clone();
        let stake_account_metadata = ctx.accounts.stake_account_metadata.clone();
        let stake_account_positions = ctx.accounts.stake_account_positions.clone();

        // assert delegator record is up to date
        delegation_record.assert_up_to_date(get_current_epoch()?)?;

        // check that publisher exists
        pool_data.get_publisher_index(&publisher)?;


        let target_with_parameters =
            staking::state::positions::TargetWithParameters::IntegrityPool { publisher };

        let cpi_accounts = staking::cpi::accounts::MergeTargetPositions {
            config: config_account,
            stake_account_positions,
            stake_account_metadata,
            owner,
            pool_authority: Some(pool_config),
        };

        let signer_seeds: &[&[&[u8]]] = &[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]];
        let cpi_ctx = CpiContext::new(staking_program, cpi_accounts).with_signer(signer_seeds);
        staking::cpi::merge_target_positions(cpi_ctx, target_with_parameters)?;

        Ok(())
    }

    pub fn undelegate(ctx: Context<Undelegate>, position_index: u8, amount: u64) -> Result<()> {
        let owner = ctx.accounts.owner.clone();
        let pool_config = &ctx.accounts.pool_config;
        let publisher = &ctx.accounts.publisher;
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;

        let config_account = ctx.accounts.config_account.clone();
        let staking_program = &ctx.accounts.staking_program;
        let stake_account_metadata = ctx.accounts.stake_account_metadata.clone();
        let stake_account_custody = ctx.accounts.stake_account_custody.clone();
        let stake_account_positions =
            &DynamicPositionArray::load(&ctx.accounts.stake_account_positions)?;
        let system_program = ctx.accounts.system_program.to_account_info();

        // update publisher accounting
        let position = stake_account_positions
            .read_position(position_index.into())?
            .ok_or(IntegrityPoolError::ThisCodeShouldBeUnreachable)?;

        let position_state = position.get_current_position(get_current_epoch()?)?;
        pool_data.remove_delegation(
            publisher.key,
            &ctx.accounts.stake_account_positions.key(),
            amount,
            position_state,
            get_current_epoch()?,
        )?;

        //cpi
        let target_with_parameters =
            staking::state::positions::TargetWithParameters::IntegrityPool {
                publisher: publisher.key(),
            };

        let cpi_accounts = staking::cpi::accounts::ClosePosition {
            owner: owner.to_account_info(),
            config: config_account.clone(),
            stake_account_positions: ctx.accounts.stake_account_positions.to_account_info(),
            stake_account_metadata: stake_account_metadata.clone(),
            stake_account_custody: stake_account_custody.clone(),
            target_account: None,
            pool_authority: Some(pool_config.to_account_info()),
            system_program,
        };

        let signer_seeds: &[&[&[u8]]] = &[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]];
        let cpi_ctx = CpiContext::new(staking_program.to_account_info(), cpi_accounts)
            .with_signer(signer_seeds);

        staking::cpi::close_position(cpi_ctx, position_index, amount, target_with_parameters)?;

        Ok(())
    }

    pub fn set_publisher_stake_account(ctx: Context<SetPublisherStakeAccount>) -> Result<()> {
        let signer = &ctx.accounts.signer;
        let publisher = &ctx.accounts.publisher;
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;
        let new_stake_account =
            DynamicPositionArray::load(&ctx.accounts.new_stake_account_positions)?;

        let publisher_target = TargetWithParameters::IntegrityPool {
            publisher: publisher.key(),
        };

        let publisher_index = pool_data.get_publisher_index(publisher.key)?;

        if pool_data.publisher_stake_accounts[publisher_index] == Pubkey::default() {
            require_eq!(
                signer.key(),
                publisher.key(),
                IntegrityPoolError::PublisherNeedsToSign
            );
        } else if let Some(current_stake_account_positions) =
            &ctx.accounts.current_stake_account_positions_option
        {
            // current stake account should be the publisher's stake account
            require_eq!(
                current_stake_account_positions.key(),
                pool_data.publisher_stake_accounts[publisher_index],
                IntegrityPoolError::PublisherStakeAccountMismatch
            );
            let current_stake_account =
                DynamicPositionArray::load(current_stake_account_positions)?;

            // current stake account should be undelegated
            require!(
                !current_stake_account.has_target_with_parameters_exposure(publisher_target)?,
                IntegrityPoolError::CurrentStakeAccountShouldBeUndelegated
            );
            require_eq!(
                signer.key(),
                current_stake_account.owner()?,
                IntegrityPoolError::StakeAccountOwnerNeedsToSign
            );
        } else {
            return Err(ErrorCode::AccountNotEnoughKeys.into());
        }


        // new stake account should be undelegated
        require!(
            !new_stake_account.has_target_with_parameters_exposure(publisher_target)?,
            IntegrityPoolError::NewStakeAccountShouldBeUndelegated
        );

        pool_data.publisher_stake_accounts[publisher_index] =
            ctx.accounts.new_stake_account_positions.key();

        Ok(())
    }

    pub fn advance(ctx: Context<Advance>) -> Result<()> {
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;
        let publisher_caps = &ctx.accounts.publisher_caps.load()?;
        let pool_config = &ctx.accounts.pool_config;

        pool_data.advance(publisher_caps, pool_config.y, get_current_epoch()?)?;

        Ok(())
    }

    pub fn advance_delegation_record(ctx: Context<AdvanceDelegationRecord>) -> Result<()> {
        let delegation_record = &mut ctx.accounts.delegation_record;
        let pool_data = &ctx.accounts.pool_data.load()?;
        let pool_config = &ctx.accounts.pool_config;
        let stake_account_positions =
            &DynamicPositionArray::load(&ctx.accounts.stake_account_positions)?;
        let pool_reward_custody = &ctx.accounts.pool_reward_custody;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let token_program = &ctx.accounts.token_program;
        let publisher = &ctx.accounts.publisher;
        let publisher_stake_account_positions = &ctx.accounts.publisher_stake_account_positions;
        let publisher_stake_account_custody = &ctx.accounts.publisher_stake_account_custody;

        let publisher_index = pool_data.get_publisher_index(&publisher.key())?;

        // reward amount in PYTH with decimals
        let (delegator_reward, publisher_reward) = pool_data.calculate_reward(
            delegation_record.last_epoch,
            &ctx.accounts.stake_account_positions.key(),
            stake_account_positions,
            &publisher.key(),
            get_current_epoch()?,
        )?;

        // transfer delegator reward from pool_reward_custody to stake_account_custody
        let cpi_accounts = anchor_spl::token::Transfer {
            from:      pool_reward_custody.to_account_info(),
            to:        stake_account_custody.to_account_info(),
            authority: pool_config.to_account_info(),
        };
        let signer_seeds: &[&[&[u8]]] = &[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]];

        let transfer_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts)
            .with_signer(signer_seeds);
        anchor_spl::token::transfer(transfer_ctx, delegator_reward)?;

        match publisher_stake_account_positions {
            Some(publisher_stake_account_positions) => {
                require_eq!(
                    pool_data.publisher_stake_accounts[publisher_index],
                    publisher_stake_account_positions.key(),
                    IntegrityPoolError::PublisherStakeAccountMismatch
                );

                let destination = publisher_stake_account_custody
                    .as_ref()
                    .ok_or(IntegrityPoolError::PublisherCustodyAccountRequired)?;

                // transfer publisher reward from pool_reward_custody to
                // publisher_stake_account_custody
                let cpi_accounts = anchor_spl::token::Transfer {
                    from:      pool_reward_custody.to_account_info(),
                    to:        destination.to_account_info(),
                    authority: pool_config.to_account_info(),
                };
                let signer_seeds: &[&[&[u8]]] =
                    &[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]];

                let transfer_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts)
                    .with_signer(signer_seeds);
                anchor_spl::token::transfer(transfer_ctx, publisher_reward)?;
            }
            None => {
                require_eq!(
                    pool_data.publisher_stake_accounts[publisher_index],
                    Pubkey::default(),
                    IntegrityPoolError::PublisherStakeAccountMismatch
                );
            }
        }

        delegation_record.advance(get_current_epoch()?)?;
        Ok(())
    }

    pub fn create_slash_event(
        ctx: Context<CreateSlashEvent>,
        index: u64,
        slash_ratio: frac64,
    ) -> Result<()> {
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;
        let slash_event = &mut ctx.accounts.slash_event;
        let slash_custody = &ctx.accounts.slash_custody;
        let publisher = &ctx.accounts.publisher.key();

        let publisher_index = pool_data.get_publisher_index(publisher)?;

        require_eq!(
            pool_data.num_slash_events[publisher_index],
            index,
            IntegrityPoolError::InvalidSlashEventIndex,
        );

        pool_data.num_slash_events[publisher_index] += 1;

        slash_event.epoch = get_current_epoch()?;
        slash_event.slash_ratio = slash_ratio;
        slash_event.slash_custody = slash_custody.key();

        Ok(())
    }

    pub fn slash(ctx: Context<Slash>, index: u64) -> Result<()> {
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;
        let slash_event = &ctx.accounts.slash_event;
        let publisher = &ctx.accounts.publisher;
        let delegation_record = &mut ctx.accounts.delegation_record;
        let stake_account_positions = &ctx.accounts.stake_account_positions.key();

        let current_epoch = get_current_epoch()?;

        require_gte!(
            current_epoch,
            slash_event.epoch,
            IntegrityPoolError::ThisCodeShouldBeUnreachable,
        );

        require_gte!(
            index,
            delegation_record.next_slash_event_index,
            IntegrityPoolError::WrongSlashEventOrder
        );

        if current_epoch > slash_event.epoch {
            // the slash window has passed, no need to slash
            delegation_record.next_slash_event_index = index + 1;
            return Ok(());
        }

        require_eq!(
            delegation_record.next_slash_event_index,
            index,
            IntegrityPoolError::WrongSlashEventOrder,
        );
        delegation_record.next_slash_event_index += 1;

        let (locked_slashed, preunlocking_slashed) = staking::cpi::slash_account(
            CpiContext::from(&*ctx.accounts)
                .with_signer(&[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]]),
            slash_event.slash_ratio,
        )?
        .get();

        pool_data.apply_slash(
            &publisher.key(),
            stake_account_positions,
            locked_slashed,
            preunlocking_slashed,
            current_epoch,
        )?;

        Ok(())
    }
}
