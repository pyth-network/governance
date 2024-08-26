use {
    anchor_lang::prelude::{
        borsh::{
            BorshDeserialize,
            BorshSerialize,
        },
        *,
    },
    litesvm::LiteSVM,
    publisher_caps::{
        MAX_CAPS,
        WORMHOLE_RECEIVER,
    },
    pythnet_sdk::{
        messages::{
            Message,
            PublisherStakeCap,
            PublisherStakeCapsMessage,
        },
        wire::v1::{
            AccumulatorUpdateData,
            MerklePriceUpdate,
            Proof,
        },
    },
    serde_wormhole::RawMessage,
    solana_sdk::{
        account::Account,
        pubkey::Pubkey,
        rent::Rent,
    },
    wormhole_sdk::Vaa,
    wormhole_solana_vaas::zero_copy::EncodedVaa,
};

#[derive(BorshDeserialize, BorshSerialize)]
pub enum ProcessingStatus {
    Unset,
    Writing,
    Verified,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct EncodedVaaHeader {
    pub status:          ProcessingStatus,
    pub write_authority: Pubkey,
    pub version:         u8,
}

pub fn get_dummy_publisher(i: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes[0] = (i % 256) as u8;
    bytes[1] = (i / 256) as u8;
    Pubkey::from(bytes)
}


pub fn build_encoded_vaa_account_from_vaa(vaa: Vaa<&RawMessage>) -> Account {
    let encoded_vaa_data = (
        EncodedVaa::DISCRIMINATOR,
        EncodedVaaHeader {
            status: ProcessingStatus::Writing,

            write_authority: Pubkey::new_unique(),
            version:         1,
        },
        serde_wormhole::to_vec(&vaa).unwrap(),
    )
        .try_to_vec()
        .unwrap();

    Account {
        lamports:   Rent::default().minimum_balance(encoded_vaa_data.len()),
        data:       encoded_vaa_data,
        owner:      WORMHOLE_RECEIVER,
        executable: false,
        rent_epoch: 0,
    }
}

pub fn deserialize_accumulator_update_data(
    accumulator_message: Vec<u8>,
) -> Result<(Vec<u8>, Vec<MerklePriceUpdate>)> {
    let accumulator_update_data =
        AccumulatorUpdateData::try_from_slice(accumulator_message.as_slice()).unwrap();

    match accumulator_update_data.proof {
        Proof::WormholeMerkle { vaa, updates } => return Ok((vaa.as_ref().to_vec(), updates)),
    }
}


pub fn create_dummy_publisher_caps_message(
    svm: &mut LiteSVM,
    first_publisher: Pubkey,
    first_publisher_cap: u64,
) -> Message {
    let timestamp = svm.get_sysvar::<Clock>().unix_timestamp;
    let mut caps: Vec<PublisherStakeCap> = vec![];

    caps.push(PublisherStakeCap {
        publisher: first_publisher.to_bytes(),
        cap:       first_publisher_cap,
    });


    // we leave the last publisher slot empty
    for i in 1..MAX_CAPS - 1 {
        caps.push(PublisherStakeCap {
            publisher: get_dummy_publisher(i).to_bytes(),
            cap:       i as u64,
        });
    }

    // publisher caps should always be sorted
    caps.sort_by_key(|cap| cap.publisher);

    Message::PublisherStakeCapsMessage(PublisherStakeCapsMessage {
        publish_time: timestamp,
        caps:         caps.into(),
    })
}
