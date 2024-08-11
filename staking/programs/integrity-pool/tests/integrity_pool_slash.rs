use {
    anchor_lang::AccountDeserialize,
    anchor_spl::token::TokenAccount,
    common_utils::frac64::FRAC_64_MULTIPLIER,
    integrity_pool::{
        error::IntegrityPoolError,
        state::{
            delegation_record::DelegationRecord,
            pool::{
                DelegationState,
                PoolData,
            },
            slash::SlashEvent,
        },
    },
    solana_sdk::{
        program_error::ProgramError,
        signature::Keypair,
        signer::Signer,
    },
    utils::{
        account::{
            fetch_account_data,
            fetch_account_data_bytemuck,
        },
        clock::advance_n_epochs,
        error::assert_anchor_program_error,
        integrity_pool::{
            advance::advance,
            delegate::{
                advance_delegation_record,
                delegate,
                get_delegation_record_address,
                undelegate,
            },
            slash::{
                create_slash_event,
                get_slash_event_address,
                slash,
            },
        },
        publisher_caps::post_publisher_caps::post_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::{
            create_stake_account::create_stake_account,
            create_token_account::create_token_account,
        },
    },
};

pub mod utils;

#[test]
fn test_create_slash_event() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority,
        publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let slash_custody = create_token_account(&mut svm, &payer, &pyth_token_mint.pubkey()).pubkey();
    let slashed_publisher = publisher_keypair.pubkey();

    assert_anchor_program_error(
        create_slash_event(
            &mut svm,
            &payer,
            &reward_program_authority,
            1,
            FRAC_64_MULTIPLIER / 2,
            slash_custody,
            slashed_publisher,
            pool_data_pubkey,
        ),
        IntegrityPoolError::InvalidSlashEventIndex.into(),
        0,
    );

    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        0,
        FRAC_64_MULTIPLIER / 2,
        slash_custody,
        slashed_publisher,
        pool_data_pubkey,
    )
    .unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.num_slash_events[publisher_index], 1);

    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        1,
        FRAC_64_MULTIPLIER / 10,
        slash_custody,
        slashed_publisher,
        pool_data_pubkey,
    )
    .unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.num_slash_events[publisher_index], 2);

    advance_n_epochs(&mut svm, &payer, 10);

    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        2,
        FRAC_64_MULTIPLIER / 10,
        slash_custody,
        slashed_publisher,
        pool_data_pubkey,
    )
    .unwrap();

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_pubkey);
    assert_eq!(pool_data.num_slash_events[publisher_index], 3);

    svm.expire_blockhash();
    assert_anchor_program_error(
        create_slash_event(
            &mut svm,
            &payer,
            &reward_program_authority,
            4,
            FRAC_64_MULTIPLIER / 2,
            slash_custody,
            slashed_publisher,
            pool_data_pubkey,
        ),
        IntegrityPoolError::InvalidSlashEventIndex.into(),
        0,
    );
    assert_anchor_program_error(
        create_slash_event(
            &mut svm,
            &payer,
            &reward_program_authority,
            2,
            FRAC_64_MULTIPLIER / 2,
            slash_custody,
            slashed_publisher,
            pool_data_pubkey,
        ),
        ProgramError::Custom(0).into(),
        0,
    );

    assert_anchor_program_error(
        create_slash_event(
            &mut svm,
            &payer,
            // wrong authority
            &Keypair::new(),
            3,
            FRAC_64_MULTIPLIER / 2,
            slash_custody,
            slashed_publisher,
            pool_data_pubkey,
        ),
        IntegrityPoolError::InvalidRewardProgramAuthority.into(),
        0,
    );

    const STARTING_EPOCH: u64 = 2;
    let slash_account_0: SlashEvent =
        fetch_account_data(&mut svm, &get_slash_event_address(0, slashed_publisher).0);

    assert_eq!(slash_account_0.epoch, STARTING_EPOCH);
    assert_eq!(slash_account_0.slash_ratio, FRAC_64_MULTIPLIER / 2);
    assert_eq!(slash_account_0.slash_custody, slash_custody);
    assert_eq!(slash_account_0.publisher, slashed_publisher);

    let slash_account_1: SlashEvent =
        fetch_account_data(&mut svm, &get_slash_event_address(1, slashed_publisher).0);

    assert_eq!(slash_account_1.epoch, STARTING_EPOCH);
    assert_eq!(slash_account_1.slash_ratio, FRAC_64_MULTIPLIER / 10);
    assert_eq!(slash_account_1.slash_custody, slash_custody);
    assert_eq!(slash_account_1.publisher, slashed_publisher);

    let slash_account_2: SlashEvent =
        fetch_account_data(&mut svm, &get_slash_event_address(2, slashed_publisher).0);

    assert_eq!(slash_account_2.epoch, STARTING_EPOCH + 10);
    assert_eq!(slash_account_2.slash_ratio, FRAC_64_MULTIPLIER / 10);
    assert_eq!(slash_account_2.slash_custody, slash_custody);
    assert_eq!(slash_account_2.publisher, slashed_publisher);
}

#[test]
fn test_slash() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority,
        publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let slash_custody = create_token_account(&mut svm, &payer, &pyth_token_mint.pubkey()).pubkey();

    let stake_account_positions =
        create_stake_account(&mut svm, &payer, &pyth_token_mint, true, true);

    // delegate 10 PYTH at epoch N
    delegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        10 * FRAC_64_MULTIPLIER,
    );

    advance_n_epochs(&mut svm, &payer, 1);

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    // undelegate 5 PYTH at epoch N + 1
    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        0,
        5 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);

    // at epoch N + 1 before slashing -> total = 10 pyth, delta = -5 pyth
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 10 * FRAC_64_MULTIPLIER,
            delta_delegation: -5 * FRAC_64_MULTIPLIER as i64,
        }
    );

    let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 50);
    advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();

    advance_delegation_record(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        stake_account_positions,
        pyth_token_mint.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    // undelegate 2 PYTH at epoch N + 2
    undelegate(
        &mut svm,
        &payer,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
        stake_account_positions,
        0,
        2 * FRAC_64_MULTIPLIER,
    )
    .unwrap();

    // create a slash event at epoch N + 2 for epoch N + 1 with 5% slash ratio
    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        0,
        FRAC_64_MULTIPLIER / 20,
        slash_custody,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    // create another slash event at epoch N + 2 for epoch N + 1 with 50% slash ratio
    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        1,
        FRAC_64_MULTIPLIER / 2,
        slash_custody,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);

    // at epoch N+2 before slashing -> total = 5 pyth, delta = -5 pyth
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 5 * FRAC_64_MULTIPLIER,
            delta_delegation: -2 * FRAC_64_MULTIPLIER as i64,
        }
    );

    assert_anchor_program_error(
        slash(
            &mut svm,
            &payer,
            stake_account_positions,
            1,
            slash_custody,
            publisher_keypair.pubkey(),
            pool_data_pubkey,
        ),
        IntegrityPoolError::WrongSlashEventOrder.into(),
        0,
    );

    slash(
        &mut svm,
        &payer,
        stake_account_positions,
        0,
        slash_custody,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    let slash_custody_data = svm.get_account(&slash_custody).unwrap();
    let slash_custody_account =
        TokenAccount::try_deserialize(&mut slash_custody_data.data.as_slice()).unwrap();

    // Slashed for epoch N + 1 -> 10 pyth * 5% = 0.5 pyth
    assert_eq!(slash_custody_account.amount, 10 * FRAC_64_MULTIPLIER / 20);

    let delegation_record: DelegationRecord = fetch_account_data(
        &mut svm,
        &get_delegation_record_address(publisher_keypair.pubkey(), stake_account_positions).0,
    );

    assert_eq!(delegation_record.next_slash_event_index, 1);

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);

    // at epoch N+2 after slashing -> total = 5 pyth - 5% = 4.75 pyth, delta = -2 pyth + 5% = -1.9
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 475 * FRAC_64_MULTIPLIER / 100,
            delta_delegation: -19 * FRAC_64_MULTIPLIER as i64 / 10,
        }
    );

    svm.expire_blockhash();
    // slash again for epoch N + 1 with 50% slash ratio
    slash(
        &mut svm,
        &payer,
        stake_account_positions,
        1,
        slash_custody,
        publisher_keypair.pubkey(),
        pool_data_pubkey,
    )
    .unwrap();

    let slash_custody_data = svm.get_account(&slash_custody).unwrap();
    let slash_custody_account =
        TokenAccount::try_deserialize(&mut slash_custody_data.data.as_slice()).unwrap();

    // slashed for epoch N + 1 -> 9.5 pyth * 50% = 4.75 pyth
    assert_eq!(
        slash_custody_account.amount,
        10 * FRAC_64_MULTIPLIER / 20 + 475 * FRAC_64_MULTIPLIER / 100
    );

    let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);

    // at epoch N+2 after 2nd slash -> total = 5 pyth - 5% - 50% = 2.375 pyth, delta = -5 pyth + 5%
    // + 50% = -0.95
    assert_eq!(
        pool_data.del_state[publisher_index],
        DelegationState {
            total_delegation: 2375 * FRAC_64_MULTIPLIER / 1000,
            delta_delegation: -95 * FRAC_64_MULTIPLIER as i64 / 100,
        }
    );
}
