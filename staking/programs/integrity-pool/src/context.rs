use {
    crate::{
        state::{
            delegation_record::DelegationRecord,
            pool::{
                PoolConfig,
                PoolData,
            },
        },
        utils::constants::{
            DELEGATION_RECORD,
            POOL_CONFIG,
        },
    },
    anchor_lang::prelude::*,
    anchor_spl::token::{
        Token,
        TokenAccount,
    },
    publisher_caps::PublisherCaps,
    staking::program::Staking,
};

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(zero)]
    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(init, payer = payer, seeds = [POOL_CONFIG.as_bytes()], space = PoolConfig::LEN, bump)]
    pub pool_config: Account<'info, PoolConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Delegate<'info> {
    pub payer: Signer<'info>,

    #[account(mut)]
    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(seeds = [POOL_CONFIG.as_bytes()], bump, has_one = pool_data)]
    pub pool_config: Account<'info, PoolConfig>,

    /// CHECK : The publisher will be checked against data in the pool_data
    #[account()]
    pub publisher: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        seeds = [staking::context::CONFIG_SEED.as_bytes()],
        bump,
        seeds::program = staking_program.key(),
    )]
    pub config_account: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it will checked in staking program
    #[account(mut)]
    pub stake_account_positions: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        mut,
        seeds = [staking::context::STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking_program.key(),
    )]
    pub stake_account_metadata: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        seeds = [staking::context::CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking_program.key(),
    )]
    pub stake_account_custody: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it will checked in staking program
    #[account(mut)]
    pub target_account: AccountInfo<'info>,

    pub staking_program: Program<'info, Staking>,
}

#[derive(Accounts)]
#[instruction(position_index: u8, amount: u64)]
pub struct Undelegate<'info> {
    pub payer: Signer<'info>,

    #[account(mut)]
    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(seeds = [POOL_CONFIG.as_bytes()], bump, has_one = pool_data)]
    pub pool_config: Account<'info, PoolConfig>,

    /// CHECK : The publisher will be checked againts data in the pool_data
    #[account()]
    pub publisher: AccountInfo<'info>,

    #[account(
        seeds = [
            DELEGATION_RECORD.as_bytes(),
            publisher.key().as_ref(),
            stake_account_positions.key().as_ref()
        ],
        bump,
    )]
    pub delegation_record: Account<'info, DelegationRecord>,
    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        seeds = [staking::context::CONFIG_SEED.as_bytes()],
        bump,
        seeds::program = staking_program.key(),
    )]
    pub config_account:    AccountInfo<'info>,

    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, staking::state::positions::PositionData>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        mut,
        seeds = [staking::context::STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking_program.key(),
    )]
    pub stake_account_metadata: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        seeds = [staking::context::CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking_program.key(),
    )]
    pub stake_account_custody: AccountInfo<'info>,

    /// CHECK : This AccountInfo is safe because it will checked in staking program
    #[account(mut)]
    pub target_account: AccountInfo<'info>,

    pub staking_program: Program<'info, Staking>,
}

#[derive(Accounts)]
pub struct SetPublisherStakeAccount<'info> {
    pub signer:                                 Signer<'info>,
    /// CHECK : The publisher will be checked against data in the pool_data
    pub publisher:                              AccountInfo<'info>,
    #[account(mut)]
    pub pool_data:                              AccountLoader<'info, PoolData>,
    #[account(seeds = [POOL_CONFIG.as_bytes()], bump, has_one = pool_data)]
    pub pool_config:                            Account<'info, PoolConfig>,
    pub new_stake_account_positions: AccountLoader<'info, staking::state::positions::PositionData>,
    pub current_stake_account_positions_option:
        Option<AccountLoader<'info, staking::state::positions::PositionData>>,
}

#[derive(Accounts)]
pub struct Advance<'info> {
    pub signer: Signer<'info>,

    #[account(mut)]
    pub pool_data: AccountLoader<'info, PoolData>,

    pub publisher_caps: AccountLoader<'info, PublisherCaps>,

    #[account(seeds = [POOL_CONFIG.as_bytes()], bump, has_one = pool_data)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        associated_token::mint = pool_config.pyth_token_mint,
        associated_token::authority = pool_config.key(),
    )]
    pub pool_reward_custody: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct AdvanceDelegationRecord<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub stake_account_positions: AccountLoader<'info, staking::state::positions::PositionData>,

    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(seeds = [POOL_CONFIG.as_bytes()], bump, has_one = pool_data)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        mut,
        associated_token::mint = pool_config.pyth_token_mint,
        associated_token::authority = pool_config.key(),
    )]
    pub pool_reward_custody: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [staking::context::CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking::id(),
    )]
    pub stake_account_custody: Account<'info, TokenAccount>,

    /// CHECK : The publisher will be checked against data in the pool_data
    pub publisher: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = DelegationRecord::LEN,
        seeds = [
            DELEGATION_RECORD.as_bytes(),
            publisher.key().as_ref(),
            stake_account_positions.key().as_ref()
        ],
        bump,
    )]
    pub delegation_record: Account<'info, DelegationRecord>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
