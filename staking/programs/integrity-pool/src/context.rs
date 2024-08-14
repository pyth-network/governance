use {
    crate::{
        error::IntegrityPoolError,
        state::{
            delegation_record::DelegationRecord,
            pool::{
                PoolConfig,
                PoolData,
            },
            slash::SlashEvent,
        },
        utils::constants::{
            DELEGATION_RECORD,
            POOL_CONFIG,
            SLASH_EVENT,
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
pub struct UpdateY<'info> {
    pub reward_program_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_CONFIG.as_bytes()],
        bump,
        has_one = reward_program_authority @ IntegrityPoolError::InvalidRewardProgramAuthority,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDelegationFee<'info> {
    pub reward_program_authority: Signer<'info>,

    #[account(mut)]
    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(
        mut,
        seeds = [POOL_CONFIG.as_bytes()],
        bump,
        has_one = reward_program_authority @ IntegrityPoolError::InvalidRewardProgramAuthority,
        has_one = pool_data @ IntegrityPoolError::InvalidPoolDataAccount,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Delegate<'info> {
    #[account(mut)]
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

    pub staking_program: Program<'info, Staking>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(position_index: u8, amount: u64)]
pub struct Undelegate<'info> {
    #[account(mut)]
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

    pub staking_program: Program<'info, Staking>,

    pub system_program: Program<'info, System>,
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

    pub publisher_stake_account_positions: Option<AccountInfo<'info>>,

    #[account(
        mut,
        seeds = [
            staking::context::CUSTODY_SEED.as_bytes(),
            publisher_stake_account_positions.as_ref().unwrap().key().as_ref()
        ],
        seeds::program = staking::id(),
        bump,
    )]
    pub publisher_stake_account_custody: Option<Account<'info, TokenAccount>>,

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

#[derive(Accounts)]
#[instruction(index: u64, slash_ratio: u64, publisher: Pubkey)]
pub struct CreateSlashEvent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub reward_program_authority: Signer<'info>,

    #[account(
        token::mint = pool_config.pyth_token_mint,
    )]
    pub slash_custody: Account<'info, TokenAccount>,

    #[account(mut)]
    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(
        mut,
        seeds = [POOL_CONFIG.as_bytes()],
        bump,
        has_one = reward_program_authority @ IntegrityPoolError::InvalidRewardProgramAuthority,
        has_one = pool_data @ IntegrityPoolError::InvalidPoolDataAccount,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        init,
        payer = payer,
        space = SlashEvent::LEN,
        seeds = [SLASH_EVENT.as_bytes(), publisher.key().as_ref(), &index.to_be_bytes()],
        bump,
    )]
    pub slash_event: Account<'info, SlashEvent>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u64)]
pub struct Slash<'info> {
    pub signer: Signer<'info>,

    #[account(mut)]
    pub pool_data: AccountLoader<'info, PoolData>,

    #[account(seeds = [POOL_CONFIG.as_bytes()], bump, has_one = pool_data)]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        seeds = [SLASH_EVENT.as_bytes(), publisher.key().as_ref(), &index.to_be_bytes()],
        bump,
        has_one = slash_custody,
    )]
    pub slash_event: Account<'info, SlashEvent>,

    #[account(
        mut,
        seeds = [
            DELEGATION_RECORD.as_bytes(),
            publisher.key().as_ref(),
            stake_account_positions.key().as_ref()
        ],
        bump,
    )]
    pub delegation_record: Account<'info, DelegationRecord>,

    // accounts for the staking program CPI
    /// CHECK : The publisher will be checked in the staking program
    pub publisher: AccountInfo<'info>,

    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, staking::state::positions::PositionData>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        mut,
        seeds = [staking::context::STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking::ID,
    )]
    pub stake_account_metadata: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [staking::context::CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        seeds::program = staking::ID,
    )]
    pub stake_account_custody: Account<'info, TokenAccount>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        seeds = [staking::context::CONFIG_SEED.as_bytes()],
        bump,
        seeds::program = staking::id(),
    )]
    pub config_account: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            staking::context::TARGET_SEED.as_bytes(),
            staking::context::VOTING_TARGET_SEED.as_bytes()
        ],
        seeds::program = staking::id(),
        bump,
    )]
    pub governance_target_account: Account<'info, staking::state::target::TargetMetadata>,

    #[account(
        mut,
        token::mint = pool_config.pyth_token_mint,
    )]
    pub slash_custody: Account<'info, TokenAccount>,

    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(
        seeds = [
            staking::context::AUTHORITY_SEED.as_bytes(),
            stake_account_positions.key().as_ref()
        ],
        seeds::program = staking::id(),
        bump
    )]
    pub custody_authority: AccountInfo<'info>,

    pub staking_program: Program<'info, Staking>,
    pub token_program:   Program<'info, Token>,
}

impl<'a, 'b, 'c, 'info> From<&Slash<'info>>
    for CpiContext<'a, 'b, 'c, 'info, staking::cpi::accounts::SlashAccount<'info>>
{
    fn from(
        accounts: &Slash<'info>,
    ) -> CpiContext<'a, 'b, 'c, 'info, staking::cpi::accounts::SlashAccount<'info>> {
        let cpi_accounts = staking::cpi::accounts::SlashAccount {
            stake_account_positions:   accounts.stake_account_positions.to_account_info(),
            stake_account_metadata:    accounts.stake_account_metadata.to_account_info(),
            stake_account_custody:     accounts.stake_account_custody.to_account_info(),
            config:                    accounts.config_account.to_account_info(),
            governance_target_account: accounts.governance_target_account.to_account_info(),
            destination:               accounts.slash_custody.to_account_info(),
            custody_authority:         accounts.custody_authority.to_account_info(),
            pool_authority:            accounts.pool_config.to_account_info(),
            publisher:                 accounts.publisher.to_account_info(),
            token_program:             accounts.token_program.to_account_info(),
        };
        let cpi_program = accounts.staking_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
