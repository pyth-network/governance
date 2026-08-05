use {
    anchor_lang::error::ErrorCode,
    integration_tests::{
        assert_anchor_program_error,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::fetch_account_data,
        staking::{
            helper_functions::{
                initialize_new_stake_account,
                initialize_new_stake_account_at,
            },
            instructions::shorten_vesting_schedule,
            pda::get_stake_account_metadata_address,
        },
    },
    solana_sdk::{
        native_token::LAMPORTS_PER_SOL,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
    staking::{
        error::ErrorCode as StakingError,
        state::{
            stake_account::StakeAccountMetadataV2,
            vesting::VestingSchedule,
        },
        ADDRESSES_TO_SHORTEN_VESTING_SCHEDULE,
    },
};

const INITIAL_BALANCE: u64 = 1_000_000;
const START_DATE: i64 = 100;
const PERIOD_DURATION: u64 = 3600;
const NUM_PERIODS: u64 = 4;

fn periodic_vesting(num_periods: u64) -> VestingSchedule {
    VestingSchedule::PeriodicVesting {
        initial_balance: INITIAL_BALANCE,
        start_date: START_DATE,
        period_duration: PERIOD_DURATION,
        num_periods,
    }
}

fn fetch_lock(svm: &mut litesvm::LiteSVM, stake_account_positions: Pubkey) -> VestingSchedule {
    let metadata: StakeAccountMetadataV2 = fetch_account_data(
        svm,
        &get_stake_account_metadata_address(stake_account_positions),
    );
    metadata.lock
}

#[test]
fn test_shorten_vesting_schedule() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair: _,
        pool_data_pubkey: _,
        reward_program_authority: _,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

    // A stake account at one of the hardcoded addresses, i.e. eligible for shortening.
    let whitelisted_stake_account_positions = initialize_new_stake_account_at(
        &mut svm,
        &owner,
        &pyth_token_mint,
        true,
        true,
        ADDRESSES_TO_SHORTEN_VESTING_SCHEDULE[0],
        periodic_vesting(NUM_PERIODS),
    );

    // A stake account at an arbitrary address, i.e. not eligible for shortening.
    let other_stake_account_positions =
        initialize_new_stake_account(&mut svm, &owner, &pyth_token_mint, true, true);

    // Wrong stake account address: the account isn't in the hardcoded list.
    assert_anchor_program_error!(
        shorten_vesting_schedule(&mut svm, &payer, other_stake_account_positions, None),
        StakingError::UnauthorizedVestingScheduleShortening,
        0
    );

    // Wrong metadata account: the metadata of another stake account doesn't match the seeds.
    assert_anchor_program_error!(
        shorten_vesting_schedule(
            &mut svm,
            &payer,
            whitelisted_stake_account_positions,
            Some(get_stake_account_metadata_address(
                other_stake_account_positions
            )),
        ),
        ErrorCode::ConstraintSeeds,
        0
    );

    // Neither failed instruction touched the vesting schedules.
    assert_eq!(
        fetch_lock(&mut svm, whitelisted_stake_account_positions),
        periodic_vesting(NUM_PERIODS)
    );
    assert_eq!(
        fetch_lock(&mut svm, other_stake_account_positions),
        VestingSchedule::FullyVested
    );

    // Happy path: only `num_periods` changes, and it becomes 1.
    shorten_vesting_schedule(&mut svm, &payer, whitelisted_stake_account_positions, None).unwrap();
    assert_eq!(
        fetch_lock(&mut svm, whitelisted_stake_account_positions),
        periodic_vesting(1)
    );

    // Idempotence: shortening an already shortened schedule is a no-op.
    svm.expire_blockhash();
    shorten_vesting_schedule(&mut svm, &payer, whitelisted_stake_account_positions, None).unwrap();
    assert_eq!(
        fetch_lock(&mut svm, whitelisted_stake_account_positions),
        periodic_vesting(1)
    );
}

#[test]
fn test_shorten_vesting_schedule_is_a_noop_for_other_schedules() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair: _,
        pool_data_pubkey: _,
        reward_program_authority: _,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

    let lock = VestingSchedule::PeriodicVestingAfterListing {
        initial_balance: INITIAL_BALANCE,
        period_duration: PERIOD_DURATION,
        num_periods:     NUM_PERIODS,
    };

    let stake_account_positions = initialize_new_stake_account_at(
        &mut svm,
        &owner,
        &pyth_token_mint,
        true,
        true,
        ADDRESSES_TO_SHORTEN_VESTING_SCHEDULE[1],
        lock,
    );

    shorten_vesting_schedule(&mut svm, &payer, stake_account_positions, None).unwrap();

    // Only `PeriodicVesting` is shortened, everything else is left alone.
    assert_eq!(fetch_lock(&mut svm, stake_account_positions), lock);
}
