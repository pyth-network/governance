use {
    anchor_spl::token::TokenAccount,
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::{
            instructions::withdraw,
            pda::get_pool_reward_custody_address,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::{
            instructions::create_token_account,
            utils::fetch_account_data,
        },
    },
    integrity_pool::{
        error::IntegrityPoolError,
        utils::types::FRAC_64_MULTIPLIER,
    },
    solana_sdk::{
        signature::Keypair,
        signer::Signer,
    },
};

#[test]
fn test_withdraw() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair: _,
        pool_data_pubkey: _,
        reward_program_authority,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:            true,
        init_target:            true,
        init_mint:              true,
        init_pool_data:         true,
        init_publishers:        true,
        reward_amount_override: None,
    });

    let pool_reward_custody = get_pool_reward_custody_address(pyth_token_mint.pubkey());
    let initial_custody_amount =
        fetch_account_data::<TokenAccount>(&mut svm, &pool_reward_custody).amount;

    // an arbitrary destination token account of the same mint
    let destination = create_token_account(&mut svm, &payer, &pyth_token_mint.pubkey()).pubkey();

    let withdraw_amount = 123 * FRAC_64_MULTIPLIER;

    // a random signer that is not the reward_program_authority cannot withdraw
    assert_anchor_program_error!(
        withdraw(
            &mut svm,
            &payer,
            &Keypair::new(),
            pyth_token_mint.pubkey(),
            destination,
            withdraw_amount,
        ),
        IntegrityPoolError::InvalidRewardProgramAuthority,
        0
    );

    // the reward_program_authority can withdraw an arbitrary amount
    withdraw(
        &mut svm,
        &payer,
        &reward_program_authority,
        pyth_token_mint.pubkey(),
        destination,
        withdraw_amount,
    )
    .unwrap();

    // funds moved from the custody to the destination
    let custody_amount = fetch_account_data::<TokenAccount>(&mut svm, &pool_reward_custody).amount;
    let destination_amount = fetch_account_data::<TokenAccount>(&mut svm, &destination).amount;

    assert_eq!(custody_amount, initial_custody_amount - withdraw_amount);
    assert_eq!(destination_amount, withdraw_amount);

    // cannot withdraw more than the custody holds (SPL token InsufficientFunds)
    assert_anchor_program_error!(
        withdraw(
            &mut svm,
            &payer,
            &reward_program_authority,
            pyth_token_mint.pubkey(),
            destination,
            custody_amount + 1,
        ),
        anchor_lang::prelude::ProgramError::from(
            anchor_spl::token::spl_token::error::TokenError::InsufficientFunds
        ),
        0
    );
}
