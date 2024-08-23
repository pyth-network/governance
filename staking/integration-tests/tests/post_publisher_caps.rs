use {
    byteorder::BigEndian,
    integration_tests::{
        governance::{
            addresses::MAINNET_GOVERNANCE_PROGRAM_ID,
            helper_functions::create_proposal_and_vote,
            instructions::create_token_owner_record,
        },
        integrity_pool::instructions::advance,
        publisher_caps::{
            instructions::{
                init_publisher_caps,
                verify_publisher_caps,
                write_publisher_caps,
            },
            utils::build_encoded_vaa_account_from_vaa,
        },
        setup::{
            setup,
            SetupProps,
            SetupResult,
            STARTING_EPOCH,
        },
        solana::{
            instructions::create_account,
            utils::{
                fetch_account_data,
                fetch_account_data_bytemuck,
                fetch_positions_account,
            },
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
    integrity_pool::{
        state::pool::PoolData,
        utils::constants::MAX_PUBLISHERS,
    },
    litesvm::LiteSVM,
    publisher_caps::{
        PublisherCaps,
        PRICE_FEEDS_EMITTER_ADDRESS,
    },
    pythnet_sdk::{
        accumulators::{
            merkle::MerkleTree,
            Accumulator,
        },
        hashers::keccak256_160::Keccak160,
        test_utils::create_vaa_from_payload,
        wire::{
            v1::MerklePriceUpdate,
            PrefixedVec,
        },
    },
    solana_cli_output::CliAccount,
    solana_sdk::{
        account::{
            AccountSharedData,
            ReadableAccount,
            WritableAccount,
        },
        pubkey::Pubkey,
        signer::Signer,
    },
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
        cmp::min,
        fs::File,
        io::Read,
        str::FromStr,
    },
    wormhole_sdk::vaa,
};


#[test]
fn test_post_publisher_caps() {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey,
        reward_program_authority: _,
        publisher_index,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: true,
    });

    let accumulator_data_account: Vec<u8> = load_account_data("pythnet/accumulator_data.json");
    let accumulator_message_account: Vec<u8> =
        load_account_data("pythnet/accumulator_message.json");

    let data_payload = accumulator_message_account[95..].to_vec();
    let publisher_caps_message = accumulator_data_account[24..].to_vec();


    let tree = MerkleTree::<Keccak160>::new(&[&publisher_caps_message]).unwrap();
    let proof = tree.prove(&publisher_caps_message).unwrap();
    let merkle_proof = MerklePriceUpdate {
        message: PrefixedVec::from(publisher_caps_message.clone()),
        proof,
    };


    let encoded_vaa = Pubkey::new_unique();

    let vaa = create_vaa_from_payload(
        &data_payload,
        wormhole_sdk::Address(PRICE_FEEDS_EMITTER_ADDRESS.to_bytes()),
        wormhole_sdk::Chain::Pythnet,
        2,
    );

    let vaa: PrefixedVec<u16, u8> = PrefixedVec::from(serde_wormhole::to_vec(&vaa).unwrap());
    svm.set_account(
        encoded_vaa,
        build_encoded_vaa_account_from_vaa(serde_wormhole::from_slice(vaa.as_ref()).unwrap()),
    )
    .unwrap();

    let publisher_caps = create_account(&mut svm, &payer, PublisherCaps::LEN, publisher_caps::ID);

    init_publisher_caps(&mut svm, &payer, publisher_caps).unwrap();


    for i in (0..publisher_caps_message.len()).step_by(1000) {
        let chunk = &publisher_caps_message[i..min(i + 1000, publisher_caps_message.len())];

        write_publisher_caps(&mut svm, &payer, publisher_caps, i, chunk).unwrap();
    }

    verify_publisher_caps(
        &mut svm,
        &payer,
        publisher_caps,
        encoded_vaa,
        vec![merkle_proof],
    )
    .unwrap();

    advance_n_epochs(&mut svm, &payer, 1);
    advance(&mut svm, &payer, publisher_caps).unwrap();
}

fn load_account_data(filename: &str) -> Vec<u8> {
    let mut file = File::open(format!("fixtures/{}", filename)).unwrap();
    let mut account_info_raw = String::new();
    file.read_to_string(&mut account_info_raw).unwrap();

    let account_info: CliAccount = serde_json::from_str(&account_info_raw).unwrap();

    let account = account_info
        .keyed_account
        .account
        .decode::<AccountSharedData>()
        .unwrap();

    account.data().to_vec()
}
