use {
    anchor_lang::error::ErrorCode,
    integration_tests::{
        assert_anchor_program_error,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::utils::{
            fetch_account_data,
            fetch_positions_account,
        },
        staking::{
            helper_functions::initialize_new_stake_account,
            instructions::{
                create_position,
                create_voter_record,
                recover_account_2,
            },
            pda::{
                get_stake_account_metadata_address,
                get_voter_record_address,
            },
        },
    },
    solana_sdk::{
        native_token::LAMPORTS_PER_SOL,
        signature::Keypair,
        signer::Signer,
    },
    staking::{
        error::ErrorCode as StakingError,
        state::{
            positions::TargetWithParameters,
            stake_account::StakeAccountMetadataV2,
            voter_weight_record::VoterWeightRecord,
        },
    },
};

#[test]
fn test_recover2() {
    let SetupResult {
        mut svm,
        payer: governance_authority,
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
    let new_owner = Keypair::new();

    svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();
    svm.airdrop(&new_owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

    let stake_account_positions =
        initialize_new_stake_account(&mut svm, &owner, &pyth_token_mint, true, true);
    // make sure voter record can be created permissionlessly if it doesn't exist
    create_voter_record(&mut svm, &new_owner, stake_account_positions).unwrap();

    assert_anchor_program_error!(
        recover_account_2(
            &mut svm,
            &owner, // governance_authority has to sign
            stake_account_positions,
            new_owner.pubkey()
        ),
        ErrorCode::ConstraintHasOne,
        0
    );

    recover_account_2(
        &mut svm,
        &governance_authority,
        stake_account_positions,
        new_owner.pubkey(),
    )
    .unwrap();

    let mut positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = positions_account.to_dynamic_position_array();
    assert_eq!(positions.owner().unwrap(), new_owner.pubkey());

    let stake_account_metadata: StakeAccountMetadataV2 = fetch_account_data(
        &mut svm,
        &get_stake_account_metadata_address(stake_account_positions),
    );
    assert_eq!(stake_account_metadata.owner, new_owner.pubkey());

    let voter_record: VoterWeightRecord =
        fetch_account_data(&mut svm, &get_voter_record_address(stake_account_positions));
    assert_eq!(voter_record.governing_token_owner, new_owner.pubkey());

    // new_owner creates a new position
    create_position(
        &mut svm,
        &new_owner,
        stake_account_positions,
        TargetWithParameters::Voting,
        None,
        100,
    )
    .unwrap();

    svm.expire_blockhash();
    // now the account can't be recovered
    assert_anchor_program_error!(
        recover_account_2(
            &mut svm,
            &governance_authority,
            stake_account_positions,
            new_owner.pubkey()
        ),
        StakingError::RecoverWithStake,
        0
    );
}
