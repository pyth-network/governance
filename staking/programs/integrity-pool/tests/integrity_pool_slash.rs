use {
    integrity_pool::{
        error::IntegrityPoolError,
        state::slash::SlashEvent,
        utils::types::FRAC_64_MULTIPLIER,
    },
    solana_sdk::{
        program_error::ProgramError,
        pubkey::Pubkey,
        signature::Keypair,
    },
    utils::{
        account::fetch_account_data,
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
    },
};

pub mod utils;

#[test]
fn test_staking_slash() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint: _,
        publisher_keypair: _,
        pool_data_pubkey: _,
        reward_program_authority,
        publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let slash_custody = Pubkey::new_unique();
    let slash_publisher = Pubkey::new_unique();

    assert_anchor_program_error(
        create_slash_event(
            &mut svm,
            &payer,
            &reward_program_authority,
            1,
            FRAC_64_MULTIPLIER / 2,
            slash_custody,
            slash_publisher,
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
        slash_publisher,
    )
    .unwrap();

    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        1,
        FRAC_64_MULTIPLIER / 10,
        slash_custody,
        slash_publisher,
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 10);

    create_slash_event(
        &mut svm,
        &payer,
        &reward_program_authority,
        2,
        FRAC_64_MULTIPLIER / 10,
        slash_custody,
        slash_publisher,
    )
    .unwrap();

    svm.expire_blockhash();
    assert_anchor_program_error(
        create_slash_event(
            &mut svm,
            &payer,
            &reward_program_authority,
            4,
            FRAC_64_MULTIPLIER / 2,
            slash_custody,
            slash_publisher,
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
            slash_publisher,
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
            slash_publisher,
        ),
        IntegrityPoolError::InvalidRewardProgramAuthority.into(),
        0,
    );

    const STARTING_EPOCH: u64 = 2;
    let slash_account_0: SlashEvent = fetch_account_data(&mut svm, &get_slash_event_address(0).0);

    assert_eq!(slash_account_0.epoch, STARTING_EPOCH);
    assert_eq!(slash_account_0.slash_ratio, FRAC_64_MULTIPLIER / 2);
    assert_eq!(slash_account_0.slash_custody, slash_custody);
    assert_eq!(slash_account_0.publisher, slash_publisher);

    let slash_account_1: SlashEvent = fetch_account_data(&mut svm, &get_slash_event_address(1).0);

    assert_eq!(slash_account_1.epoch, STARTING_EPOCH);
    assert_eq!(slash_account_1.slash_ratio, FRAC_64_MULTIPLIER / 10);
    assert_eq!(slash_account_1.slash_custody, slash_custody);
    assert_eq!(slash_account_1.publisher, slash_publisher);

    let slash_account_2: SlashEvent = fetch_account_data(&mut svm, &get_slash_event_address(2).0);

    assert_eq!(slash_account_2.epoch, STARTING_EPOCH + 10);
    assert_eq!(slash_account_2.slash_ratio, FRAC_64_MULTIPLIER / 10);
    assert_eq!(slash_account_2.slash_custody, slash_custody);
    assert_eq!(slash_account_2.publisher, slash_publisher);
}
