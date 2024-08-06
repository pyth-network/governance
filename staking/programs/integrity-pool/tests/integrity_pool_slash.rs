use {
    integrity_pool::{
        error::IntegrityPoolError,
        state::{
            pool::PoolData,
            slash::SlashEvent,
        },
        utils::types::FRAC_64_MULTIPLIER,
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
        integrity_pool::slash::{
            create_slash_event,
            get_slash_event_address,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        staking::create_token_account::create_token_account,
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
