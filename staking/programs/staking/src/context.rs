use {
    crate::{
        error::ErrorCode,
        state::*,
    },
    anchor_lang::prelude::*,
    anchor_spl::token::{
        Mint,
        Token,
        TokenAccount,
        Transfer,
    },
    std::iter::Iterator,
};

pub const AUTHORITY_SEED: &str = "authority";
pub const CUSTODY_SEED: &str = "custody";
pub const STAKE_ACCOUNT_METADATA_SEED: &str = "stake_metadata";
pub const CONFIG_SEED: &str = "config";
pub const VOTER_RECORD_SEED: &str = "voter_weight";
pub const TARGET_SEED: &str = "target";
pub const MAX_VOTER_RECORD_SEED: &str = "max_voter";
pub const VOTING_TARGET_SEED: &str = "voting";
pub const INTEGRITY_POOL_TARGET_SEED: &str = "integrity";
pub const SPLIT_REQUEST: &str = "split_request";

impl positions::Target {
    pub fn get_seed(&self) -> Vec<u8> {
        match *self {
            positions::Target::Voting => VOTING_TARGET_SEED.as_bytes().to_vec(),
            positions::Target::IntegrityPool { ref pool_authority } => {
                return INTEGRITY_POOL_TARGET_SEED
                    .as_bytes()
                    .iter()
                    .chain(pool_authority.as_ref()[..16].iter())
                    .cloned()
                    .collect()
            }
        }
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    // Native payer
    #[account(mut)]
    pub payer:          Signer<'info>,
    #[account(
        init,
        seeds = [CONFIG_SEED.as_bytes()],
        bump,
        payer = payer,
        space = global_config::GlobalConfig::LEN
    )]
    // Stake program accounts:
    pub config_account: Account<'info, global_config::GlobalConfig>,
    // Primitive accounts:
    pub rent:           Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new_authority : Pubkey)]
pub struct UpdateGovernanceAuthority<'info> {
    pub governance_authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = governance_authority)]
    pub config:               Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(new_authority : Pubkey)]
pub struct UpdatePdaAuthority<'info> {
    pub pda_authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = pda_authority)]
    pub config:        Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(token_list_time : Option<i64>)]
pub struct UpdateTokenListTime<'info> {
    pub governance_authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = governance_authority)]
    pub config:               Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(agreement_hash : [u8; 32])]
pub struct UpdateAgreementHash<'info> {
    pub governance_authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = governance_authority)]
    pub config:               Account<'info, global_config::GlobalConfig>,
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
    #[account(init, payer = payer, space = stake_account::StakeAccountMetadataV2::LEN, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump)]
    pub stake_account_metadata:  Box<Account<'info, stake_account::StakeAccountMetadataV2>>,
    #[account(
        init,
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump,
        payer = payer,
        token::mint = pyth_token_mint,
        token::authority = custody_authority,
    )]
    pub stake_account_custody:   Box<Account<'info, TokenAccount>>,
    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(seeds = [AUTHORITY_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump)]
    pub custody_authority:       AccountInfo<'info>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = pyth_token_mint)]
    pub config:                  Box<Account<'info, global_config::GlobalConfig>>,
    // Pyth token mint:
    pub pyth_token_mint:         Box<Account<'info, Mint>>,
    // Primitive accounts :
    pub rent:                    Sysvar<'info, Rent>,
    pub token_program:           Program<'info, Token>,
    pub system_program:          Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateVoterRecord<'info> {
    // Native payer:
    #[account(mut)]
    pub payer:                   Signer<'info>,
    // Stake program accounts:
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(mut, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadataV2>,
    #[account(
        init,
        payer = payer,
        space = voter_weight_record::VoterWeightRecord::LEN,
        seeds = [VOTER_RECORD_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump)]
    pub voter_record:            Box<Account<'info, voter_weight_record::VoterWeightRecord>>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
    pub system_program:          Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount : u64)]
pub struct WithdrawStake<'info> {
    // Native payer:
    pub owner:                   Signer<'info>,
    // Destination
    #[account(mut)]
    pub destination:             Account<'info, TokenAccount>,
    // Stake program accounts:
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump, has_one = owner)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadataV2>,
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
#[instruction(target_with_parameters:   positions::TargetWithParameters, amount : u64)]
pub struct CreatePosition<'info> {
    // Native payer:
    pub owner:                   Signer<'info>,
    // Stake program accounts:
    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(mut, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump, has_one = owner)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadataV2>,
    #[account(
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.custody_bump,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
    // Target account :
    #[account(
        mut,
        seeds = [TARGET_SEED.as_bytes(),&target_with_parameters.get_target().get_seed()[..]],
        bump = target_account.bump)]
    pub target_account:          Account<'info, target::TargetMetadata>,
    pub pool_authority:          Option<Signer<'info>>,
}

#[derive(Accounts)]
#[instruction(index : u8, amount : u64, target_with_parameters: positions::TargetWithParameters)] // target_with_parameters is in the instruction arguments because it's needed in the anchor PDA
                                                                                                  // checks
pub struct ClosePosition<'info> {
    // Native payer:
    pub owner:                   Signer<'info>,
    // Stake program accounts:
    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(mut, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump, has_one = owner)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadataV2>,
    #[account(
        seeds = [CUSTODY_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.custody_bump,
    )]
    pub stake_account_custody:   Account<'info, TokenAccount>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
    // Target account :
    #[account(
        mut,
        seeds = [TARGET_SEED.as_bytes(), &target_with_parameters.get_target().get_seed()[..]],
        bump = target_account.bump)]
    pub target_account:          Account<'info, target::TargetMetadata>,
    pub pool_authority:          Option<Signer<'info>>,
}

#[derive(Accounts)]
#[instruction(action : voter_weight_record::VoterWeightAction)]
pub struct UpdateVoterWeight<'info> {
    // Native payer:
    pub owner:                   Signer<'info>,
    // Stake program accounts:
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump, has_one = owner)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadataV2>,
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
    // Governance target account:
    #[account(
        mut,
        seeds = [TARGET_SEED.as_bytes(), VOTING_TARGET_SEED.as_bytes()],
        bump = governance_target.bump)]
    pub governance_target:       Account<'info, target::TargetMetadata>,
}
#[derive(Accounts)]
pub struct UpdateMaxVoterWeight<'info> {
    // Native payer:
    #[account(mut)]
    pub payer:            Signer<'info>,
    #[account(init, payer = payer, space = max_voter_weight_record::MaxVoterWeightRecord::LEN ,seeds = [MAX_VOTER_RECORD_SEED.as_bytes()], bump)]
    pub max_voter_record: Account<'info, max_voter_weight_record::MaxVoterWeightRecord>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:           Account<'info, global_config::GlobalConfig>,
    pub system_program:   Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(_target : positions::Target)]
pub struct CreateTarget<'info> {
    #[account(mut)]
    pub payer:                Signer<'info>,
    pub governance_authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = governance_authority)]
    pub config:               Account<'info, global_config::GlobalConfig>,
    #[account(
        init,
        payer = payer,
        seeds =  [TARGET_SEED.as_bytes(), &_target.get_seed()[..]],
        space = target::TargetMetadata::LEN,
        bump)]
    pub target_account:       Account<'info, target::TargetMetadata>,
    pub system_program:       Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount : u64, recipient : Pubkey)]
pub struct RequestSplit<'info> {
    // Native payer:
    #[account(mut)]
    pub owner:                       Signer<'info>,
    // Stake program accounts:
    pub stake_account_positions:     AccountLoader<'info, positions::PositionData>,
    #[account(seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump, has_one = owner)]
    pub stake_account_metadata:      Account<'info, stake_account::StakeAccountMetadataV2>,
    #[account(init_if_needed, payer = owner, space=split_request::SplitRequest::LEN ,  seeds = [SPLIT_REQUEST.as_bytes(), stake_account_positions.key().as_ref()], bump)]
    pub stake_account_split_request: Account<'info, split_request::SplitRequest>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config:                      Account<'info, global_config::GlobalConfig>,
    // Primitive accounts :
    pub system_program:              Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, recipient: Pubkey)]
pub struct AcceptSplit<'info> {
    // Native payer:
    #[account(mut)]
    pub pda_authority:                      Signer<'info>,
    // Current stake accounts:
    #[account(mut)]
    pub source_stake_account_positions:     AccountLoader<'info, positions::PositionData>,
    #[account(mut, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), source_stake_account_positions.key().as_ref()], bump = source_stake_account_metadata.metadata_bump)]
    pub source_stake_account_metadata: Box<Account<'info, stake_account::StakeAccountMetadataV2>>,
    #[account(mut, seeds = [SPLIT_REQUEST.as_bytes(), source_stake_account_positions.key().as_ref()], bump)]
    pub source_stake_account_split_request: Box<Account<'info, split_request::SplitRequest>>,
    #[account(
        mut,
        seeds = [CUSTODY_SEED.as_bytes(), source_stake_account_positions.key().as_ref()],
        bump = source_stake_account_metadata.custody_bump,
    )]
    pub source_stake_account_custody:       Box<Account<'info, TokenAccount>>,
    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(seeds = [AUTHORITY_SEED.as_bytes(), source_stake_account_positions.key().as_ref()], bump = source_stake_account_metadata.authority_bump)]
    pub source_custody_authority:           AccountInfo<'info>,

    // New stake accounts :
    #[account(zero)]
    pub new_stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(init, payer = pda_authority, space = stake_account::StakeAccountMetadataV2::LEN, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), new_stake_account_positions.key().as_ref()], bump)]
    pub new_stake_account_metadata:  Box<Account<'info, stake_account::StakeAccountMetadataV2>>,
    #[account(
        init,
        seeds = [CUSTODY_SEED.as_bytes(), new_stake_account_positions.key().as_ref()],
        bump,
        payer = pda_authority,
        token::mint = pyth_token_mint,
        token::authority = new_custody_authority,
    )]
    pub new_stake_account_custody:   Box<Account<'info, TokenAccount>>,
    /// CHECK : This AccountInfo is safe because it's a checked PDA
    #[account(seeds = [AUTHORITY_SEED.as_bytes(), new_stake_account_positions.key().as_ref()], bump)]
    pub new_custody_authority:       AccountInfo<'info>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = pda_authority, has_one = pyth_token_mint)]
    pub config:                      Box<Account<'info, global_config::GlobalConfig>>,

    // Pyth token mint:
    pub pyth_token_mint: Box<Account<'info, Mint>>,
    // Primitive accounts :
    pub rent:            Sysvar<'info, Rent>,
    pub token_program:   Program<'info, Token>,
    pub system_program:  Program<'info, System>,
}

impl<'a, 'b, 'c, 'info> From<&AcceptSplit<'info>>
    for CpiContext<'a, 'b, 'c, 'info, Transfer<'info>>
{
    fn from(accounts: &AcceptSplit<'info>) -> CpiContext<'a, 'b, 'c, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from:      accounts.source_stake_account_custody.to_account_info(),
            to:        accounts.new_stake_account_custody.to_account_info(),
            authority: accounts.source_custody_authority.to_account_info(),
        };
        let cpi_program = accounts.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[derive(Accounts)]
#[instruction(agreement_hash : [u8; 32])]
pub struct JoinDaoLlc<'info> {
    // Native payer:
    pub owner:                   Signer<'info>,
    // Stake program accounts:
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,
    #[account(mut, seeds = [STAKE_ACCOUNT_METADATA_SEED.as_bytes(), stake_account_positions.key().as_ref()], bump = stake_account_metadata.metadata_bump, has_one = owner)]
    pub stake_account_metadata:  Account<'info, stake_account::StakeAccountMetadataV2>,
    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, constraint = config.agreement_hash == agreement_hash @ ErrorCode::InvalidLlcAgreement)]
    pub config:                  Account<'info, global_config::GlobalConfig>,
}

// Anchor's parser doesn't understand cfg(feature), so the IDL gets messed
// up if we try to use it here. We can just keep the definition the same.
#[derive(Accounts)]
#[instruction(seconds: i64)]
pub struct AdvanceClock<'info> {
    #[account(mut, seeds = [CONFIG_SEED.as_bytes()], bump = config.bump)]
    pub config: Account<'info, global_config::GlobalConfig>,
}

#[derive(Accounts)]
pub struct RecoverAccount<'info> {
    // Native payer:
    pub governance_authority: Signer<'info>,

    // Token account:
    pub owner: Account<'info, TokenAccount>,

    // Stake program accounts:
    #[account(mut)]
    pub stake_account_positions: AccountLoader<'info, positions::PositionData>,

    #[account(
        mut,
        seeds = [
            STAKE_ACCOUNT_METADATA_SEED.as_bytes(),
            stake_account_positions.key().as_ref()
        ],
        bump = stake_account_metadata.metadata_bump,
        has_one = owner
    )]
    pub stake_account_metadata: Account<'info, stake_account::StakeAccountMetadataV2>,

    #[account(
        mut,
        seeds = [VOTER_RECORD_SEED.as_bytes(), stake_account_positions.key().as_ref()],
        bump = stake_account_metadata.voter_bump
    )]
    pub voter_record: Account<'info, voter_weight_record::VoterWeightRecord>,

    #[account(seeds = [CONFIG_SEED.as_bytes()], bump = config.bump, has_one = governance_authority)]
    pub config: Account<'info, global_config::GlobalConfig>,
}
