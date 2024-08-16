use {
    anchor_lang::AccountDeserialize,
    anchor_spl::token::TokenAccount,
    integration_tests::{
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::{
            instructions::create_token_account,
            utils::{
                fetch_account_data,
                fetch_positions_account,
            },
        },
        staking::{
            helper_functions::initialize_new_stake_account,
            instructions::{
                create_position,
                join_dao_llc,
                merge_target_positions,
                slash_staking,
                update_pool_authority,
                update_token_list_time,
                update_voter_weight,
            },
            pda::{
                get_stake_account_metadata_address,
                get_target_address,
                get_voter_record_address,
            },
        },
        utils::{
            clock::advance_n_epochs,
            error::assert_anchor_program_error,
        },
    },
    integrity_pool::utils::types::FRAC_64_MULTIPLIER,
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
        stake,
    },
    staking::{
        error::ErrorCode,
        state::{
            positions::TargetWithParameters,
            stake_account::{
                self,
                StakeAccountMetadataV2,
            },
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


#[test]
fn test_old_stake_account() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
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

    update_token_list_time(&mut svm, &payer, 1684591200);
    advance_n_epochs(&mut svm, &payer, 2850);
    join_dao_llc(&mut svm, &payer, stake_account_positions).unwrap();
    update_voter_weight(&mut svm, &payer, stake_account_positions).unwrap();

    let target_account: TargetMetadata = fetch_account_data(&mut svm, &get_target_address());
    let voter_record: VoterWeightRecord =
        fetch_account_data(&mut svm, &get_voter_record_address(stake_account_positions));

    let mut positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = positions_account.to_dynamic_position_array();

    let pos1 = positions.read_position(0).unwrap().unwrap();
    let pos2 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(
        voter_record.voter_weight,
        (((pos1.amount + pos2.amount) as u128) * 10_000_000_000_000_000u128
            / target_account.locked as u128) as u64
    );

    assert!(positions.get_position_capacity() == 20);

    for i in 2..positions.get_position_capacity() {
        assert!(positions.read_position(i).unwrap().is_none());
    }

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
    assert_eq!(
        voter_record.voter_weight,
        (((post_pos1.amount + post_pos2.amount + post_pos3.amount) as u128)
            * 10_000_000_000_000_000u128
            / (target_account.locked + post_pos3.amount) as u128) as u64
    );

    merge_target_positions(&mut svm, &payer, stake_account_positions).unwrap();

    let mut positions_account = fetch_positions_account(&mut svm, &stake_account_positions);
    let positions = positions_account.to_dynamic_position_array();

    assert!(positions.get_position_capacity() == 2);

    let pos1 = positions.read_position(0).unwrap().unwrap();
    let pos2 = positions.read_position(1).unwrap().unwrap();

    assert_eq!(
        pos1.activation_epoch,
        std::cmp::min(post_pos1.activation_epoch, post_pos2.activation_epoch)
    );
    assert_eq!(pos1.amount, post_pos1.amount + post_pos2.amount);
    assert_eq!(pos1.unlocking_start, None);

    assert_eq!(pos2.activation_epoch, post_pos3.activation_epoch);
    assert_eq!(pos2.amount, post_pos3.amount);
    assert_eq!(pos2.unlocking_start, None);


    assert_eq!(
        positions.read_position(2).unwrap_err(),
        staking::error::ErrorCode::PositionOutOfBounds.into()
    );

    svm.expire_blockhash();
    update_voter_weight(&mut svm, &payer, stake_account_positions).unwrap();
    let voter_record: VoterWeightRecord =
        fetch_account_data(&mut svm, &get_voter_record_address(stake_account_positions));
    assert_eq!(
        voter_record.voter_weight,
        (((post_pos1.amount + post_pos2.amount + post_pos3.amount) as u128)
            * 10_000_000_000_000_000u128
            / (target_account.locked + post_pos3.amount) as u128) as u64
    );
}

// These accounts were snapshotted on 16th August 2024
fn load_stake_accounts(svm: &mut LiteSVM, payer: &Pubkey, pyth_token_mint: &Pubkey) -> Pubkey {
    let mut stake_account_positions = load_account_file("stake_account_positions.json");
    stake_account_positions.account.data_as_mut_slice()[8..40].copy_from_slice(&payer.to_bytes());
    svm.set_account(
        stake_account_positions.address,
        stake_account_positions.account.into(),
    )
    .unwrap();

    let mut stake_account_metadata = load_account_file("stake_account_metadata.json");
    stake_account_metadata.account.data_as_mut_slice()[12..44].copy_from_slice(&payer.to_bytes());
    svm.set_account(
        stake_account_metadata.address,
        stake_account_metadata.account.into(),
    )
    .unwrap();


    let mut stake_account_custody = load_account_file("stake_account_custody.json");
    stake_account_custody.account.data_as_mut_slice()[..32]
        .copy_from_slice(&pyth_token_mint.to_bytes());
    svm.set_account(
        stake_account_custody.address,
        stake_account_custody.account.into(),
    )
    .unwrap();

    let mut voter_record = load_account_file("voter_record.json");
    voter_record.account.data_as_mut_slice()[32..64].copy_from_slice(&pyth_token_mint.to_bytes());
    voter_record.account.data_as_mut_slice()[64..96].copy_from_slice(&payer.to_bytes());
    svm.set_account(voter_record.address, voter_record.account.into())
        .unwrap();


    let target_account = load_account_file("target_account.json");
    svm.set_account(target_account.address, target_account.account.into())
        .unwrap();

    stake_account_positions.address
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
