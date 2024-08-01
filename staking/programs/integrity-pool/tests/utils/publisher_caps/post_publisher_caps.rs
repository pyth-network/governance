use core::time;
use std::{cmp::min, convert::TryInto};

use {
    crate::utils::account::create_account, anchor_lang::{
       InstructionData, ToAccountMetas
    }, litesvm::LiteSVM, publisher_caps::{PublisherCaps, MAX_CAPS, WORMHOLE_RECEIVER}, serde_wormhole::RawMessage, solana_sdk::{
        account::Account, compute_budget::ComputeBudgetInstruction, instruction::Instruction, pubkey::Pubkey, rent::Rent, signature::Keypair, signer::Signer, transaction::Transaction
    }, wormhole_sdk::Vaa, wormhole_solana_vaas::zero_copy::EncodedVaa
};
use anchor_lang::prelude::*;
use byteorder::BigEndian;
use pythnet_sdk::{messages::Message, test_utils::create_dummy_price_feed_message, wire::v1::{AccumulatorUpdateData, MerklePriceUpdate, Proof}};
use pythnet_sdk::messages::PublisherStakeCapsMessage;
use pythnet_sdk::messages::PublisherStakeCap;
use pythnet_sdk::test_utils::create_accumulator_message;
use anchor_lang::prelude::borsh::BorshDeserialize;
use anchor_lang::prelude::borsh::BorshSerialize;

#[derive(BorshDeserialize, BorshSerialize)]
pub enum ProcessingStatus {
    Unset,
    Writing,
    Verified,
}

#[derive(BorshDeserialize, BorshSerialize)]
pub struct EncodedVaaHeader {
    pub status: ProcessingStatus,
    pub write_authority: Pubkey,
    pub version: u8,
}

pub fn get_dummy_publisher(i: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes[0] = (i % 256) as u8;
    bytes[1] = (i / 256) as u8;
    Pubkey::from(bytes)
}


pub fn build_encoded_vaa_account_from_vaa(
    vaa: Vaa<&RawMessage>,
) -> Account {
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


pub fn create_dummy_publisher_caps_message(svm : &mut LiteSVM, first_publisher : Pubkey, first_publisher_cap : u64) -> Message {
    let timestamp = svm.get_sysvar::<Clock>().unix_timestamp;
    let mut caps : Vec<PublisherStakeCap> = vec![];

    caps.push(PublisherStakeCap {
        publisher: first_publisher.to_bytes(),
        cap:    first_publisher_cap,
    });


    for i in 1..MAX_CAPS {
        caps.push(PublisherStakeCap {
            publisher: get_dummy_publisher(i).to_bytes(),
            cap:    i as u64,
        });
    }

    // publisher caps should always be sorted
    caps.sort_by_key(|cap| cap.publisher);

    Message::PublisherStakeCapsMessage(PublisherStakeCapsMessage {
        publish_time : timestamp,
        caps: caps.into(),
    })
} 


pub fn post_publisher_caps(
    svm: &mut LiteSVM,
    payer: &Keypair,
    first_publisher: Pubkey,
    first_publisher_cap: u64,
) -> Pubkey {
    let publisher_caps_message = create_dummy_publisher_caps_message(svm, first_publisher, first_publisher_cap);
    let feed_1 = create_dummy_price_feed_message(100);
    let message =
        create_accumulator_message(&[&feed_1, &publisher_caps_message], &[&publisher_caps_message], false, false);
    let (vaa, merkle_proofs) = deserialize_accumulator_update_data(message).unwrap();
 
    let encoded_vaa = Keypair::new().pubkey();
    svm.set_account(encoded_vaa, build_encoded_vaa_account_from_vaa(serde_wormhole::from_slice(&vaa).unwrap())).unwrap();

    let publisher_caps = create_account(svm, payer, PublisherCaps::LEN, publisher_caps::ID);

    let accounts = publisher_caps::accounts::InitPublisherCaps {
        signer: payer.pubkey(),
        publisher_caps,
    };

    let instruction_data = publisher_caps::instruction::InitPublisherCaps {
    };

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    let transaction = Transaction::new_signed_with_payer(
        &[
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(transaction).unwrap();


    let publisher_caps_message_bytes = pythnet_sdk::wire::to_vec::<_,BigEndian>(&publisher_caps_message).unwrap();

    for i in (0..publisher_caps_message_bytes.len()).step_by(1000){
        let chunk = &publisher_caps_message_bytes[i..min(i+1000, publisher_caps_message_bytes.len())];
        let accounts = publisher_caps::accounts::WritePublisherCaps {
            write_authority: payer.pubkey(),
            publisher_caps,
        };

        let instruction_data = publisher_caps::instruction::WritePublisherCaps {
            index: i.try_into().unwrap(),
            data: chunk.to_vec(),
        };

        let instruction = Instruction {
            program_id: publisher_caps::ID,
            accounts:   accounts.to_account_metas(None),
            data:       instruction_data.data(),
        };

        let transaction = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&payer.pubkey()),
            &[payer],
            svm.latest_blockhash(),
        );
        svm.send_transaction(transaction).unwrap();
    }

    let accounts = publisher_caps::accounts::VerifyPublisherCaps {
        signer: payer.pubkey(),
        publisher_caps,
        encoded_vaa
    };

    let instruction_data = publisher_caps::instruction::VerifyPublisherCaps {
        proof: merkle_proofs[0].proof.0.clone()
    };

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    let transaction = Transaction::new_signed_with_payer(
        &[
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(transaction).unwrap();

    publisher_caps
}
