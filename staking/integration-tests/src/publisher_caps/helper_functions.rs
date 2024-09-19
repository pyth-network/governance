use {
    super::{
        instructions::{
            init_publisher_caps,
            verify_publisher_caps,
            write_publisher_caps,
        },
        utils::{
            build_encoded_vaa_account_from_vaa,
            create_publisher_caps_message,
            deserialize_accumulator_update_data,
        },
    },
    crate::solana::instructions::create_account,
    byteorder::BigEndian,
    litesvm::LiteSVM,
    publisher_caps::{
        PublisherCaps,
        PRICE_FEEDS_EMITTER_ADDRESS,
    },
    pythnet_sdk::{
        messages::Message,
        test_utils::{
            create_accumulator_message,
            create_dummy_price_feed_message,
            DataSource,
        },
    },
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
    },
    std::cmp::min,
};

pub fn write_and_verify_publisher_caps(
    svm: &mut LiteSVM,
    payer: &Keypair,
    publisher_caps_message: Message,
) -> Pubkey {
    let feed_1 = create_dummy_price_feed_message(100);
    let message = create_accumulator_message(
        &[&feed_1, &publisher_caps_message],
        &[&publisher_caps_message],
        false,
        false,
        Some(DataSource {
            address: wormhole_sdk::Address(PRICE_FEEDS_EMITTER_ADDRESS.to_bytes()),
            chain:   wormhole_sdk::Chain::Pythnet,
        }),
    );
    let (vaa, merkle_proofs) = deserialize_accumulator_update_data(message).unwrap();

    let encoded_vaa = Pubkey::new_unique();
    svm.set_account(
        encoded_vaa,
        build_encoded_vaa_account_from_vaa(serde_wormhole::from_slice(&vaa).unwrap()),
    )
    .unwrap();

    let publisher_caps = create_account(svm, payer, PublisherCaps::LEN, publisher_caps::ID);

    init_publisher_caps(svm, payer, publisher_caps).unwrap();


    let publisher_caps_message_bytes =
        pythnet_sdk::wire::to_vec::<_, BigEndian>(&publisher_caps_message).unwrap();

    for i in (0..publisher_caps_message_bytes.len()).step_by(1000) {
        let chunk =
            &publisher_caps_message_bytes[i..min(i + 1000, publisher_caps_message_bytes.len())];

        write_publisher_caps(svm, payer, publisher_caps, i, chunk).unwrap();
    }

    verify_publisher_caps(svm, payer, publisher_caps, encoded_vaa, merkle_proofs).unwrap();

    publisher_caps
}

pub fn post_publisher_caps(
    svm: &mut LiteSVM,
    payer: &Keypair,
    publishers: Vec<Pubkey>,
    publisher_caps: Vec<u64>,
) -> Pubkey {
    let publisher_caps_message =
        create_publisher_caps_message(svm, publishers, publisher_caps, false);
    write_and_verify_publisher_caps(svm, payer, publisher_caps_message)
}

pub fn post_dummy_publisher_caps(
    svm: &mut LiteSVM,
    payer: &Keypair,
    first_publisher: Pubkey,
    first_publisher_cap: u64,
) -> Pubkey {
    let publisher_caps_message =
        create_publisher_caps_message(svm, vec![first_publisher], vec![first_publisher_cap], true);
    write_and_verify_publisher_caps(svm, payer, publisher_caps_message)
}
