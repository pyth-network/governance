use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{
    Mint,
    Token,
    TokenAccount,
    Transfer,
};

pub const AUTHORITY_SEED: &str = "authority";
pub const CUSTODY_SEED: &str = "custody";
pub const STAKE_ACCOUNT_METADATA_SEED: &str = "stake_metadata";
pub const CONFIG_SEED: &str = "config";
pub const VOTER_RECORD_SEED: &str = "voter_weight";
pub const PRODUCT_SEED: &str = "product";

#[derive(Accounts)]
#[instruction(config_data : global_config::GlobalConfig)]
pub struct InitConfig<'info> {
    // Native payer
    #[account(mut)]
    pub payer:          Signer<'info>,
    #[account(
        init,
        seeds = [CONFIG_SEED.as_bytes()],
        bump,
        payer = payer
    )]
    // Stake program accounts:
    pub config_account: Account<'info, global_config::GlobalConfig>,
    // Primitive accounts:
    pub rent:           Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(owner : Pubkey, lock : vesting::VestingSchedule)]
pub struct CreateStakeAccount<'info> {
    // Native payer:
    #[account(mut)]
    pub payer:                   Signer<'info>,
    // Stake program accounts:
    #[account(zero)]
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(init, payer = payer, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadata>,
    #[account(
        init,
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        payer = payer,
        token::mint = mint,
        token::authority = custody_authority,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(seeds = [AUTHORITY_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump)]
    pub custody_authority:       AccountInfo<'info>,
    #[account(
        init,
        payer = payer,
        space = voter_weight_record::VOTER_WEIGHT_RECORD_SIZE,
        seeds = [VOTER_RECORD_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump)]
    pub voter_record:            Account<'info, voter_weight_record::VoterWeightRecord>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
    // Pyth token mint:
    #[account(address = config.pyth_token_mint)]
    pub mint:                    Account<'info, Mint>,
    // Primitive accounts :
    pub rent:                    Sysvar<'info, Rent>,
    pub token_program:           Program<'info, Token>,
    pub system_program:          Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount : u64)]
pub struct WithdrawStake<'info> {
    // Native payer:
    #[account( address = stake_account_metadata.owner)]
    pub payer:                   Signer<'info>,
    // Destination
    #[account(mut)]
    pub destination:             Account<'info, TokenAccount>,
    // Stake program accounts:
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadata>,
    #[account(
        mut,
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.custody_bump,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(seeds = [AUTHORITY_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.authority_bump)]
    pub custody_authority:       AccountInfo<'info>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
    // Primitive accounts :
    pub token_program:           Program<'info, Token>,
}

impl<'a, 'b, 'c, 'info> From<&WithdrawStake<'info>>
    for CpiContext<'a, 'b, 'c, 'info, Transfer<'info>>
{
    fn from(accounts: &WithdrawStake<'info>) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from:      accounts.stake_account_custody.to_account_info(),
            to:        accounts.destination.to_account_info(),
            authority: accounts.custody_authority.to_account_info(),
        };
        let cpi_program = accounts.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[derive(Accounts)]
#[instruction(product : Option<Pubkey>, publisher : Option<Pubkey>, amount : u64)]
pub struct CreatePosition<'info> {
    // Native payer:
    #[account( address = stake_account_metadata.owner)]
    pub payer:                   Signer<'info>,
    // Stake program accounts:
    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadata>,
    #[account(
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.custody_bump,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(index : u8, amount : u64)]
pub struct ClosePosition<'info> {
    // Native payer:
    #[account( address = stake_account_metadata.owner)]
    pub payer:                   Signer<'info>,
    // Stake program accounts:
    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadata>,
    #[account(
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.custody_bump,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
pub struct UpdateVoterWeight<'info> {
    // Native payer:
    #[account(address = stake_account_metadata.owner)]
    pub payer:                   Signer<'info>,
    // Stake program accounts:
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadata>,
    #[account(
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.custody_bump,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [VOTER_RECORD_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.voter_bump)]
    pub voter_record:            Account<'info, voter_weight_record::VoterWeightRecord>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(product : Option<Pubkey>)]
pub struct CreateProduct<'info> {
    #[account(mut, address = config.governance_authority)]
    pub payer:           Signer<'info>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:          Account<'info, global_config::GlobalConfig>,
    #[account(
        init,
        payer = payer,
        seeds = [PRODUCT_SEED.as_bytes(), product.map_or(Pubkey::default(), |v| v).as_ref()], //can we find a better way for this where the seed is empty when option is none
        bump)]
    pub product_account: Account<'info, product::ProductMetadata>,
    pub system_program:  Program<'info, System>,
}

#[derive(Accounts)]
pub struct CleanupPositions<'info> {
    pub payer: Signer<'info>,
}

// Anchor's parser doesn't understand cfg(feature), so the IDL gets messed
// up if we try to use it here. We can just keep the definition the same.
#[derive(Accounts)]
#[instruction(seconds: i64)]
pub struct AdvanceClock<'info> {
    #[account(mut, seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config: Account<'info, global_config::GlobalConfig>,
}
