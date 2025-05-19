use {
    anchor_lang::error::{
        AnchorError,
        ErrorCode,
    },
    integration_tests::{
        assert_anchor_program_error,
        governance::{
            addresses::MAINNET_GOVERNANCE_PROGRAM_ID,
            helper_functions::create_proposal_and_vote,
            instructions::create_token_owner_record,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::utils::{
            fetch_account_data,
            fetch_positions_account,
        },
        staking::{
            helper_functions::initialize_new_stake_account,
            instructions::{
                create_position,
                create_stake_account,
                create_voter_record,
                join_dao_llc,
                merge_target_positions,
                recover_account_2,
                update_token_list_time,
                update_voter_weight,
            },
            pda::{
                get_stake_account_metadata_address,
                get_target_address,
                get_voter_record_address,
            },
        },
        utils::clock::advance_n_epochs,
    },
    litesvm::LiteSVM,
    solana_cli_output::CliAccount,
    solana_sdk::{
        account::{
            AccountSharedData,
            WritableAccount,
        },
        native_token::LAMPORTS_PER_SOL,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
    staking::{
        error::ErrorCode as StakingError,
        state::{
            max_voter_weight_record::MAX_VOTER_WEIGHT,
            positions::{
                TargetWithParameters,
                POSITION_BUFFER_SIZE,
            },
            stake_account::StakeAccountMetadataV2,
            target::TargetMetadata,
            voter_weight_record::VoterWeightRecord,
        },
    },
    std::{
        fs::File,
        io::Read,
        str::FromStr,
    },
};

const MAINNET_TOKENS_LIST_TIME: i64 = 1684591200;
const MAINNET_ELAPSED_EPOCHS: u64 = 2850;

#[test]
/// This test has two purposes:
/// 1) to test the voting functionality against the deployed governance program and configuration
/// 2) to test that the new staking account is compatible with stake account positions with the old
///    fixed sized position array and such accounts can be turned into the new version by calling
///    merge_target_positions and nothing breaks
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
    create_voter_record(&mut svm, &governance_authority, stake_account_positions).unwrap();

    assert_anchor_program_error!(
        recover_account_2(
            &mut svm,
            &owner,
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
    assert_eq!(voter_record.voter_weight, 0);

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
