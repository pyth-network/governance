use {
    integration_tests::{
        assert_anchor_program_error,
        publisher_caps::{
            helper_functions::post_dummy_publisher_caps,
            instructions::close_publisher_caps,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
    },
    publisher_caps::PublisherCapsError,
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
    },
};


#[test]
fn test_close_publisher_caps() {
    let SetupResult {
        mut svm,
        payer,
        publisher_keypair,
        ..
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let publisher_caps =
        post_dummy_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 10);

    assert!(svm.get_account(&publisher_caps).unwrap().lamports > 0);
    let payer_balance_before = svm.get_account(&payer.pubkey()).unwrap().lamports;

    assert_anchor_program_error!(
        close_publisher_caps(&mut svm, &Keypair::new(), &payer, publisher_caps),
        PublisherCapsError::WrongWriteAuthority,
        0
    );

    close_publisher_caps(&mut svm, &payer, &payer, publisher_caps).unwrap();
    assert_eq!(svm.get_account(&publisher_caps).unwrap().data.len(), 0);
    assert_eq!(svm.get_account(&publisher_caps).unwrap().lamports, 0);

    assert!(svm.get_account(&payer.pubkey()).unwrap().lamports > payer_balance_before);
}
