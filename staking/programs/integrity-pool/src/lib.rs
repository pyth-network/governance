use {
    anchor_lang::prelude::*,
    context::*,
    error::IntegrityPoolError,
    staking::state::positions::TargetWithParameters,
    utils::{
        clock::{
            get_current_epoch,
            UNLOCKING_DURATION,
        },
        constants::POOL_CONFIG,
        types::frac64,
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
        y: u64,
    ) -> Result<()> {
        let pool_config = &mut ctx.accounts.pool_config;
        pool_config.pool_data = ctx.accounts.pool_data.key();
        pool_config.reward_program_authority = reward_program_authority;
        pool_config.pyth_token_mint = pyth_token_mint;
        pool_config.y = y;

        let mut pool_data = ctx.accounts.pool_data.load_init()?;
        pool_data.last_updated_epoch = get_current_epoch()?;

        Ok(())
    }

    pub fn delegate(ctx: Context<Delegate>, amount: u64) -> Result<()> {
        let payer = ctx.accounts.payer.clone();
        let pool_config = &ctx.accounts.pool_config;
        let publisher = &ctx.accounts.publisher;
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;

        let config_account = ctx.accounts.config_account.clone();
        let staking_program = &ctx.accounts.staking_program;
        let stake_account_positions = ctx.accounts.stake_account_positions.clone();
        let stake_account_metadata = ctx.accounts.stake_account_metadata.clone();
        let stake_account_custody = ctx.accounts.stake_account_custody.clone();
        let target_account = ctx.accounts.target_account.clone();

        let target_with_parameters =
            staking::state::positions::TargetWithParameters::IntegrityPool {
                pool_authority: pool_config.key(),
                publisher:      publisher.key(),
            };

        let cpi_accounts = staking::cpi::accounts::CreatePosition {
            config: config_account,
            stake_account_positions,
            stake_account_metadata,
            stake_account_custody,
            owner: payer.to_account_info(),
            target_account,
            pool_authority: Some(pool_config.to_account_info()),
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

    pub fn undelegate(ctx: Context<Undelegate>, position_index: u8, amount: u64) -> Result<()> {
        let payer = ctx.accounts.payer.clone();
        let pool_config = &ctx.accounts.pool_config;
        let publisher = &ctx.accounts.publisher;
        let pool_data = &mut ctx.accounts.pool_data.load_mut()?;
        let delegation_record = &ctx.accounts.delegation_record;

        let config_account = ctx.accounts.config_account.clone();
        let staking_program = &ctx.accounts.staking_program;
        let stake_account_metadata = ctx.accounts.stake_account_metadata.clone();
        let stake_account_custody = ctx.accounts.stake_account_custody.clone();
        let target_account = ctx.accounts.target_account.clone();
        let stake_account_positions = ctx.accounts.stake_account_positions.clone();

        // assert delegator record is up to date
        delegation_record.assert_up_to_date(get_current_epoch()?)?;

        // update publisher accounting
        let position = stake_account_positions
            .load()?
            .read_position(position_index as usize)?
            .ok_or(IntegrityPoolError::ThisCodeShouldBeUnreachable)?;

        let position_state =
            position.get_current_position(get_current_epoch()?, UNLOCKING_DURATION)?;
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
                pool_authority: pool_config.key(),
                publisher:      publisher.key(),
            };

        let cpi_accounts = staking::cpi::accounts::ClosePosition {
            owner:                   payer.to_account_info(),
            config:                  config_account.clone(),
            stake_account_positions: ctx.accounts.stake_account_positions.to_account_info(),
            stake_account_metadata:  stake_account_metadata.clone(),
            stake_account_custody:   stake_account_custody.clone(),
            target_account:          target_account.clone(),
            pool_authority:          Some(pool_config.to_account_info()),
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
        let new_stake_account = &ctx.accounts.new_stake_account_positions.load()?;

        let publisher_target = TargetWithParameters::IntegrityPool {
            pool_authority: ctx.accounts.pool_config.key(),
            publisher:      publisher.key(),
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
            let current_stake_account = current_stake_account_positions.load()?;

            // current stake account should be undelegated
            require!(
                !current_stake_account.has_target_with_parameters_exposure(publisher_target)?,
                IntegrityPoolError::CurrentStakeAccountShouldBeUndelegated
            );
            require_eq!(
                signer.key(),
                current_stake_account.owner,
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
        let stake_account_positions = ctx.accounts.stake_account_positions.clone();
        let positions = stake_account_positions.load()?;
        let pool_reward_custody = &ctx.accounts.pool_reward_custody;
        let stake_account_custody = &ctx.accounts.stake_account_custody;
        let token_program = &ctx.accounts.token_program;
        let publisher = &ctx.accounts.publisher;

        // reward amount in PYTH with decimals
        let reward_amount: frac64 = pool_data.calculate_reward(
            delegation_record.last_epoch,
            &stake_account_positions.key(),
            positions,
            &publisher.key(),
            &pool_config.key(),
            get_current_epoch()?,
        )?;

        // reward is less than a unit, no need to transfer
        if reward_amount == 0 {
            delegation_record.advance(get_current_epoch()?)?;
            return Ok(());
        }

        // transfer reward from pool_reward_custody to stake_account_custody
        let cpi_accounts = anchor_spl::token::Transfer {
            from:      pool_reward_custody.to_account_info(),
            to:        stake_account_custody.to_account_info(),
            authority: pool_config.to_account_info(),
        };
        let signer_seeds: &[&[&[u8]]] = &[&[POOL_CONFIG.as_bytes(), &[ctx.bumps.pool_config]]];

        let ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts)
            .with_signer(signer_seeds);
        anchor_spl::token::transfer(ctx, reward_amount)?;

        delegation_record.advance(get_current_epoch()?)?;
        Ok(())
    }
}
