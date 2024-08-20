use {
    integration_tests::{
        governance::{
            addresses::MAINNET_GOVERNANCE_PROGRAM_ID,
            helper_functions::create_proposal_and_vote,
            instructions::{
                cast_vote,
                create_proposal,
                create_token_owner_record,
            },
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::utils::{
            fetch_account_data,
            fetch_governance_account_data,
            fetch_positions_account,
        },
        staking::{
            instructions::{
                create_position,
                join_dao_llc,
                merge_target_positions,
                update_token_list_time,
                update_voter_weight,
            },
            pda::{
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
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
    spl_governance::state::proposal::ProposalV2,
    staking::state::{
        max_voter_weight_record::MAX_VOTER_WEIGHT,
        positions::{
            TargetWithParameters,
            POSITION_BUFFER_SIZE,
        },
        target::TargetMetadata,
        voter_weight_record::VoterWeightRecord,
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
/// fixed sized position array and such accounts can be turned into the new version by calling
/// merge_target_positions and nothing breaks
fn test_voting() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair: _,
        pool_data_pubkey: _,
        reward_program_authority: _,
        publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let stake_account_positions =
        load_stake_accounts(&mut svm, &payer.pubkey(), &pyth_token_mint.pubkey());
    let governance_address = load_governance_accounts(&mut svm, &pyth_token_mint.pubkey());

    update_token_list_time(&mut svm, &payer, MAINNET_TOKENS_LIST_TIME);
    advance_n_epochs(&mut svm, &payer, MAINNET_ELAPSED_EPOCHS);
    join_dao_llc(&mut svm, &payer, stake_account_positions).unwrap();
    update_voter_weight(&mut svm, &payer, stake_account_positions).unwrap();

    let target_account: TargetMetadata = fetch_account_data(&mut svm, &get_target_address());
    let voter_record: VoterWeightRecord =
        fetch_account_data(&mut svm, &get_voter_record_address(stake_account_positions));

    // Check that the voter weight is calculated correctly
    let mut positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = positions_account.to_dynamic_position_array();

    let pos1 = positions.read_position(0).unwrap().unwrap();
    let pos2 = positions.read_position(1).unwrap().unwrap();
    assert!(positions.get_position_capacity() == 20);

    for i in 2..positions.get_position_capacity() {
        assert!(positions.read_position(i).unwrap().is_none());
    }

    let expected_voter_weight = (((pos1.amount + pos2.amount) as u128) * MAX_VOTER_WEIGHT as u128
        / target_account.locked as u128) as u64;

    assert_eq!(voter_record.voter_weight, expected_voter_weight);

    // Try voting against the actual governance program
    create_token_owner_record(&mut svm, &payer).unwrap();
    let actual_proposal_data = create_proposal_and_vote(
        &mut svm,
        &payer,
        &stake_account_positions,
        &governance_address,
    );
    assert_eq!(actual_proposal_data.options.len(), 1);
    assert_eq!(
        actual_proposal_data.options[0].vote_weight,
        expected_voter_weight
    );

    // Test some other actions
    // create_positions, merge_positions
    create_position(
        &mut svm,
        &payer,
        stake_account_positions,
        TargetWithParameters::Voting,
        None,
        100,
    );

    let mut positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = positions_account.to_dynamic_position_array();

    let post_pos1 = positions.read_position(0).unwrap().unwrap();
    let post_pos2 = positions.read_position(1).unwrap().unwrap();
    let post_pos3 = positions.read_position(2).unwrap().unwrap();

    assert_eq!(post_pos1, pos1);
    assert_eq!(post_pos2, pos2);

    assert_eq!(post_pos3.activation_epoch, STARTING_EPOCH + 2851);

    assert!(positions.get_position_capacity() == 20);

    for i in 3..positions.get_position_capacity() {
        assert!(positions.read_position(i).unwrap().is_none());
    }

    advance_n_epochs(&mut svm, &payer, 1);
    update_voter_weight(&mut svm, &payer, stake_account_positions).unwrap();

    let voter_record: VoterWeightRecord =
        fetch_account_data(&mut svm, &get_voter_record_address(stake_account_positions));

    let expected_voter_weight = (((post_pos1.amount + post_pos2.amount + post_pos3.amount) as u128)
        * MAX_VOTER_WEIGHT as u128
        / (target_account.locked + post_pos3.amount) as u128)
        as u64;

    assert_eq!(voter_record.voter_weight, expected_voter_weight);

    merge_target_positions(&mut svm, &payer, stake_account_positions).unwrap();

    let mut positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = positions_account.to_dynamic_position_array();

    assert!(positions.get_position_capacity() == 2);
    assert_eq!(positions.acc_info.data_len(), 40 + 2 * POSITION_BUFFER_SIZE);


    let post_merge_pos1 = positions.read_position(0).unwrap().unwrap();
    let post_merge_pos2 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(
        post_merge_pos1.activation_epoch,
        std::cmp::min(post_pos1.activation_epoch, post_pos2.activation_epoch)
    );
    assert_eq!(post_merge_pos1.amount, post_pos1.amount + post_pos2.amount);
    assert_eq!(post_merge_pos1.unlocking_start, None);

    assert_eq!(post_merge_pos2.activation_epoch, post_pos3.activation_epoch);
    assert_eq!(post_merge_pos2.amount, post_pos3.amount);
    assert_eq!(post_merge_pos2.unlocking_start, None);


    assert_eq!(
        positions.read_position(2).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

    // Voter weight should be the same after merging
    svm.expire_blockhash();
    update_voter_weight(&mut svm, &payer, stake_account_positions).unwrap();
    let voter_record: VoterWeightRecord =
        fetch_account_data(&mut svm, &get_voter_record_address(stake_account_positions));
    assert_eq!(voter_record.voter_weight, expected_voter_weight);

    // Vote again, after merging
    let proposal_account = create_proposal_and_vote(
        &mut svm,
        &payer,
        &stake_account_positions,
        &governance_address,
    );
    assert_eq!(proposal_account.options.len(), 1);
    assert_eq!(
        proposal_account.options[0].vote_weight,
        expected_voter_weight
    );
}

// These accounts were snapshotted on 16th August 2024
/// When loading these stake accounts, we need to replace the mainnet owner of the account by a key
/// we have access to in the tests. We also need to replace the mainnet pyth mint address by the one
/// in the tests.
fn load_stake_accounts(svm: &mut LiteSVM, payer: &Pubkey, pyth_token_mint: &Pubkey) -> Pubkey {
    let mut stake_account_positions = load_account_file("staking/stake_account_positions.json");
    stake_account_positions.account.data_as_mut_slice()[8..40].copy_from_slice(&payer.to_bytes());
    svm.set_account(
        stake_account_positions.address,
        stake_account_positions.account.into(),
    )
    .unwrap();

    let mut stake_account_metadata = load_account_file("staking/stake_account_metadata.json");
    stake_account_metadata.account.data_as_mut_slice()[12..44].copy_from_slice(&payer.to_bytes());
    svm.set_account(
        stake_account_metadata.address,
        stake_account_metadata.account.into(),
    )
    .unwrap();


    let mut stake_account_custody = load_account_file("staking/stake_account_custody.json");
    stake_account_custody.account.data_as_mut_slice()[..32]
        .copy_from_slice(&pyth_token_mint.to_bytes());
    svm.set_account(
        stake_account_custody.address,
        stake_account_custody.account.into(),
    )
    .unwrap();

    let mut voter_record = load_account_file("staking/voter_record.json");
    voter_record.account.data_as_mut_slice()[40..72].copy_from_slice(&pyth_token_mint.to_bytes());
    voter_record.account.data_as_mut_slice()[72..104].copy_from_slice(&payer.to_bytes());
    svm.set_account(voter_record.address, voter_record.account.into())
        .unwrap();


    let target_account = load_account_file("staking/target_account.json");
    svm.set_account(target_account.address, target_account.account.into())
        .unwrap();

    stake_account_positions.address
}

// These accounts were snapshotted on 16th August 2024
fn load_governance_accounts(svm: &mut LiteSVM, pyth_token_mint: &Pubkey) -> Pubkey {
    svm.add_program_from_file(
        MAINNET_GOVERNANCE_PROGRAM_ID,
        "fixtures/governance/governance.so",
    )
    .unwrap();

    let mut realm = load_account_file("governance/realm.json");
    realm.account.data_as_mut_slice()[1..33].copy_from_slice(&pyth_token_mint.to_bytes());
    svm.set_account(realm.address, realm.account.into())
        .unwrap();

    let governance = load_account_file("governance/governance.json");
    svm.set_account(governance.address, governance.account.into())
        .unwrap();

    let realm_config = load_account_file("governance/realm_config.json");
    svm.set_account(realm_config.address, realm_config.account.into())
        .unwrap();

    governance.address
}

pub struct LoadedAccount {
    pub address: Pubkey,
    pub account: AccountSharedData,
}

fn load_account_file(filename: &str) -> LoadedAccount {
    let mut file = File::open(format!("fixtures/{}", filename)).unwrap();
    let mut account_info_raw = String::new();
    file.read_to_string(&mut account_info_raw).unwrap();

    let account_info: CliAccount = serde_json::from_str(&account_info_raw).unwrap();

    let address = Pubkey::from_str(account_info.keyed_account.pubkey.as_str()).unwrap();

    let account = account_info
        .keyed_account
        .account
        .decode::<AccountSharedData>()
        .unwrap();

    LoadedAccount { address, account }
}
