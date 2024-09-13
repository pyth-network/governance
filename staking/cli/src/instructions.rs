use {
    anchor_lang::{
        AccountDeserialize,
        InstructionData,
        ToAccountMetas,
    },
    anchor_spl::{
        associated_token::spl_associated_token_account,
        token::spl_token,
    },
    base64::Engine,
    integration_tests::{
        integrity_pool::pda::{
            get_delegation_record_address,
            get_pool_config_address,
            get_pool_reward_custody_address,
            get_slash_event_address,
        },
        staking::pda::{
            get_config_address,
            get_stake_account_custody_address,
            get_stake_account_custody_authority_address,
            get_stake_account_metadata_address,
            get_target_address,
        },
    },
    integrity_pool::state::{
        delegation_record::DelegationRecord,
        pool::{
            PoolConfig,
            PoolData,
        },
    },
    publisher_caps::PublisherCaps,
    pythnet_sdk::wire::v1::{
        AccumulatorUpdateData,
        MerklePriceUpdate,
        Proof,
    },
    reqwest::blocking::Client,
    serde_wormhole::RawMessage,
    solana_client::{
        rpc_client::RpcClient,
        rpc_config::RpcSendTransactionConfig,
    },
    solana_sdk::{
        commitment_config::CommitmentConfig,
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        rent::Rent,
        signature::Keypair,
        signer::Signer,
        system_instruction::{
            self,
            create_account,
        },
        system_program,
        transaction::Transaction,
    },
    std::{
        cmp::min,
        convert::TryInto,
        mem::size_of,
    },
    wormhole_core_bridge_solana::sdk::{
        WriteEncodedVaaArgs,
        VAA_START,
    },
    wormhole_sdk::vaa::{
        Body,
        Header,
    },
    wormhole_solana::{
        Account,
        GuardianSet,
    },
};

pub fn init_publisher_caps(rpc_client: &RpcClient, payer: &Keypair) -> Pubkey {
    let publisher_caps = Keypair::new();
    let create_account_ix = create_account(
        &payer.pubkey(),
        &publisher_caps.pubkey(),
        rpc_client
            .get_minimum_balance_for_rent_exemption(PublisherCaps::LEN)
            .unwrap(),
        PublisherCaps::LEN.try_into().unwrap(),
        &publisher_caps::ID,
    );

    let accounts = publisher_caps::accounts::InitPublisherCaps {
        signer:         payer.pubkey(),
        publisher_caps: publisher_caps.pubkey(),
    };

    let instruction_data = publisher_caps::instruction::InitPublisherCaps {};

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(
        rpc_client,
        &[
            create_account_ix,
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        &[payer, &publisher_caps],
    );

    publisher_caps.pubkey()
}

pub fn write_publisher_caps(
    rpc_client: &RpcClient,
    payer: &Keypair,
    publisher_caps: Pubkey,
    index: usize,
    chunk: &[u8],
) {
    let accounts = publisher_caps::accounts::WritePublisherCaps {
        write_authority: payer.pubkey(),
        publisher_caps,
    };

    let instruction_data = publisher_caps::instruction::WritePublisherCaps {
        index: index.try_into().unwrap(),
        data:  chunk.to_vec(),
    };

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[payer]);
}

pub fn close_publisher_caps(rpc_client: &RpcClient, payer: &Keypair, publisher_caps: Pubkey) {
    let accounts = publisher_caps::accounts::ClosePublisherCaps {
        write_authority: payer.pubkey(),
        publisher_caps,
    };

    let instruction_data = publisher_caps::instruction::ClosePublisherCaps {};

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[payer]);
}


pub fn verify_publisher_caps(
    rpc_client: &RpcClient,
    payer: &Keypair,
    publisher_caps: Pubkey,
    encoded_vaa: Pubkey,
    merkle_proofs: Vec<MerklePriceUpdate>,
) {
    let accounts = publisher_caps::accounts::VerifyPublisherCaps {
        signer: payer.pubkey(),
        publisher_caps,
        encoded_vaa,
    };

    let instruction_data = publisher_caps::instruction::VerifyPublisherCaps {
        proof: merkle_proofs[0].proof.to_vec(),
    };

    let instruction = Instruction {
        program_id: publisher_caps::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(
        rpc_client,
        &[
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        &[payer],
    );
}

pub fn deserialize_accumulator_update_data(
    accumulator_message: Vec<u8>,
) -> (Vec<u8>, Vec<MerklePriceUpdate>) {
    let accumulator_update_data =
        AccumulatorUpdateData::try_from_slice(accumulator_message.as_slice()).unwrap();

    match accumulator_update_data.proof {
        Proof::WormholeMerkle { vaa, updates } => return (vaa.as_ref().to_vec(), updates),
    }
}

pub fn process_transaction(
    rpc_client: &RpcClient,
    instructions: &[Instruction],
    signers: &[&Keypair],
) {
    let mut transaction = Transaction::new_with_payer(instructions, Some(&signers[0].pubkey()));
    transaction.sign(signers, rpc_client.get_latest_blockhash().unwrap());
    let transaction_signature_res = rpc_client
        .send_and_confirm_transaction_with_spinner_and_config(
            &transaction,
            CommitmentConfig::confirmed(),
            RpcSendTransactionConfig {
                skip_preflight: true,
                ..Default::default()
            },
        );
    match transaction_signature_res {
        Ok(signature) => {
            println!("Transaction successful : {signature:?}");
        }
        Err(err) => {
            println!("transaction err: {err:?}");
        }
    }
}

pub fn process_write_encoded_vaa(
    rpc_client: &RpcClient,
    vaa: &[u8],
    wormhole: Pubkey,
    payer: &Keypair,
) -> Pubkey {
    let encoded_vaa_keypair = Keypair::new();
    let encoded_vaa_size: usize = vaa.len() + VAA_START;

    let create_encoded_vaa = system_instruction::create_account(
        &payer.pubkey(),
        &encoded_vaa_keypair.pubkey(),
        Rent::default().minimum_balance(encoded_vaa_size),
        encoded_vaa_size as u64,
        &wormhole,
    );
    let init_encoded_vaa_accounts = wormhole_core_bridge_solana::accounts::InitEncodedVaa {
        write_authority: payer.pubkey(),
        encoded_vaa:     encoded_vaa_keypair.pubkey(),
    }
    .to_account_metas(None);

    let init_encoded_vaa_instruction = Instruction {
        program_id: wormhole,
        accounts:   init_encoded_vaa_accounts,
        data:       wormhole_core_bridge_solana::instruction::InitEncodedVaa.data(),
    };

    process_transaction(
        rpc_client,
        &[create_encoded_vaa, init_encoded_vaa_instruction],
        &[payer, &encoded_vaa_keypair],
    );

    for i in (0..vaa.len()).step_by(1000) {
        let chunk = &vaa[i..min(i + 1000, vaa.len())];

        write_encoded_vaa(
            rpc_client,
            payer,
            &encoded_vaa_keypair.pubkey(),
            &wormhole,
            chunk,
        );
    }

    let (header, _): (Header, Body<&RawMessage>) = serde_wormhole::from_slice(vaa).unwrap();
    let guardian_set = GuardianSet::key(&wormhole, header.guardian_set_index);

    let request_compute_units_instruction: Instruction =
        ComputeBudgetInstruction::set_compute_unit_limit(600_000);

    let verify_encoded_vaa_accounts = wormhole_core_bridge_solana::accounts::VerifyEncodedVaaV1 {
        guardian_set,
        write_authority: payer.pubkey(),
        draft_vaa: encoded_vaa_keypair.pubkey(),
    }
    .to_account_metas(None);

    let verify_encoded_vaa_instruction = Instruction {
        program_id: wormhole,
        accounts:   verify_encoded_vaa_accounts,
        data:       wormhole_core_bridge_solana::instruction::VerifyEncodedVaaV1 {}.data(),
    };

    process_transaction(
        rpc_client,
        &[
            verify_encoded_vaa_instruction,
            request_compute_units_instruction,
        ],
        &[payer],
    );


    encoded_vaa_keypair.pubkey()
}

pub fn write_encoded_vaa(
    rpc_client: &RpcClient,
    payer: &Keypair,
    encoded_vaa: &Pubkey,
    wormhole: &Pubkey,
    chunk: &[u8],
) {
    let write_encoded_vaa_accounts = wormhole_core_bridge_solana::accounts::WriteEncodedVaa {
        write_authority: payer.pubkey(),
        draft_vaa:       *encoded_vaa,
    }
    .to_account_metas(None);

    let write_encoded_vaa_accounts_instruction = Instruction {
        program_id: *wormhole,
        accounts:   write_encoded_vaa_accounts.clone(),
        data:       wormhole_core_bridge_solana::instruction::WriteEncodedVaa {
            args: WriteEncodedVaaArgs {
                index: 0,
                data:  chunk.to_vec(),
            },
        }
        .data(),
    };

    process_transaction(
        rpc_client,
        &[write_encoded_vaa_accounts_instruction],
        &[payer],
    );
}

pub fn initialize_reward_custody(rpc_client: &RpcClient, payer: &Keypair) {
    let pool_config = get_pool_config_address();

    let PoolConfig {
        pyth_token_mint, ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let create_ata_ix = spl_associated_token_account::instruction::create_associated_token_account(
        &payer.pubkey(),
        &pool_config,
        &pyth_token_mint,
        &spl_token::ID,
    );

    process_transaction(rpc_client, &[create_ata_ix], &[payer]);
}

pub fn advance(rpc_client: &RpcClient, payer: &Keypair, publisher_caps: Pubkey) {
    let pool_config = get_pool_config_address();

    let PoolConfig {
        pool_data,
        pyth_token_mint,
        ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let pool_reward_custody = get_pool_reward_custody_address(pyth_token_mint);

    let accounts = integrity_pool::accounts::Advance {
        signer: payer.pubkey(),
        pool_config,
        publisher_caps,
        pool_data,
        pool_reward_custody,
    };

    let instruction_data = integrity_pool::instruction::Advance {};

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(
        rpc_client,
        &[
            instruction,
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
        ],
        &[payer],
    );
}

pub fn initialize_pool(
    rpc_client: &RpcClient,
    payer: &Keypair,
    pool_data_keypair: &Keypair,
    reward_program_authority: Pubkey,
    y: u64,
    slash_custody: Pubkey,
) {
    let pool_data_space: u64 = PoolData::LEN.try_into().unwrap();
    let config_address = get_config_address();

    let rent = rpc_client
        .get_minimum_balance_for_rent_exemption(pool_data_space.try_into().unwrap())
        .unwrap();

    let create_pool_data_acc_ix = create_account(
        &payer.pubkey(),
        &pool_data_keypair.pubkey(),
        rent,
        pool_data_space,
        &integrity_pool::ID,
    );

    let pool_config_pubkey = get_pool_config_address();

    let initialize_pool_data = integrity_pool::instruction::InitializePool {
        reward_program_authority,
        y,
    };

    let initialize_pool_accs = integrity_pool::accounts::InitializePool {
        payer: payer.pubkey(),
        pool_data: pool_data_keypair.pubkey(),
        pool_config: pool_config_pubkey,
        config_account: config_address,
        slash_custody,
        system_program: system_program::ID,
    };

    let initialize_pool_ix = Instruction::new_with_bytes(
        integrity_pool::ID,
        &initialize_pool_data.data(),
        initialize_pool_accs.to_account_metas(None),
    );


    process_transaction(
        rpc_client,
        &[create_pool_data_acc_ix, initialize_pool_ix],
        &[payer, pool_data_keypair],
    );
}

pub fn fetch_publisher_caps_and_advance(
    rpc_client: &RpcClient,
    payer: &Keypair,
    wormhole: Pubkey,
    hermes_url: String,
) {
    let client = Client::new();
    let response = client
        .get(format!(
            "{}v2/updates/publisher_stake_caps/latest?encoding=base64",
            hermes_url
        ))
        .send()
        .unwrap();

    let json: serde_json::Value = response.json().unwrap();
    let encoded_message = json["binary"]["data"][0].as_str().unwrap();

    //decode tmp from base64
    let message = base64::prelude::BASE64_STANDARD
        .decode(encoded_message)
        .unwrap();

    let (vaa, merkle_proofs) = deserialize_accumulator_update_data(message);


    let encoded_vaa = process_write_encoded_vaa(rpc_client, vaa.as_slice(), wormhole, payer);


    let publisher_caps = init_publisher_caps(rpc_client, payer);


    let publisher_caps_message_bytes =
        Vec::<u8>::from(merkle_proofs.first().unwrap().message.clone());


    for i in (0..publisher_caps_message_bytes.len()).step_by(1000) {
        let chunk =
            &publisher_caps_message_bytes[i..min(i + 1000, publisher_caps_message_bytes.len())];

        write_publisher_caps(rpc_client, payer, publisher_caps, i, chunk);
    }

    verify_publisher_caps(
        rpc_client,
        payer,
        publisher_caps,
        encoded_vaa,
        merkle_proofs,
    );


    println!(
        "Initialized publisher caps with pubkey : {:?}",
        publisher_caps
    );

    advance(rpc_client, payer, publisher_caps);
    close_publisher_caps(rpc_client, payer, publisher_caps);
}

pub fn update_delegation_fee(rpc_client: &RpcClient, payer: &Keypair, delegation_fee: u64) {
    let pool_config = get_pool_config_address();

    let PoolConfig { pool_data, .. } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let accounts = integrity_pool::accounts::UpdateDelegationFee {
        reward_program_authority: payer.pubkey(),
        pool_config,
        pool_data,
        system_program: system_program::ID,
    };

    let instruction_data = integrity_pool::instruction::UpdateDelegationFee { delegation_fee };

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[payer]);
}

pub fn set_publisher_stake_account(
    rpc_client: &RpcClient,
    signer: &Keypair,
    publisher: &Pubkey,
    stake_account_positions: &Pubkey,
) {
    let pool_config = get_pool_config_address();

    let PoolConfig { pool_data, .. } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let accounts = integrity_pool::accounts::SetPublisherStakeAccount {
        signer: signer.pubkey(),
        publisher: *publisher,
        current_stake_account_positions_option: None,
        new_stake_account_positions_option: Some(*stake_account_positions),
        pool_config,
        pool_data,
    };

    let instruction_data = integrity_pool::instruction::SetPublisherStakeAccount {};

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[signer]);
}

pub fn create_slash_event(
    rpc_client: &RpcClient,
    signer: &Keypair,
    publisher: &Pubkey,
    slash_ratio: u64,
) {
    let pool_config = get_pool_config_address();

    let PoolConfig {
        pool_data: pool_data_address,
        slash_custody,
        ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let pool_data = PoolData::try_deserialize(
        &mut rpc_client.get_account_data(&pool_data_address).unwrap()[..8 + size_of::<PoolData>()]
            .as_ref(),
    )
    .unwrap();

    let publisher_index = pool_data.get_publisher_index(publisher).unwrap();
    let index = pool_data.num_slash_events[publisher_index];

    let accounts = integrity_pool::accounts::CreateSlashEvent {
        payer: signer.pubkey(),
        reward_program_authority: signer.pubkey(),
        publisher: *publisher,
        slash_custody,
        pool_config,
        pool_data: pool_data_address,
        slash_event: get_slash_event_address(index, *publisher),
        system_program: system_program::ID,
    };

    let instruction_data = integrity_pool::instruction::CreateSlashEvent { index, slash_ratio };

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[signer]);
}

pub fn update_reward_program_authority(
    rpc_client: &RpcClient,
    signer: &Keypair,
    new_reward_program_authority: &Pubkey,
) {
    let pool_config = get_pool_config_address();

    let accounts = integrity_pool::accounts::UpdateRewardProgramAuthority {
        reward_program_authority: signer.pubkey(),
        pool_config,
        system_program: system_program::ID,
    };

    let instruction_data = integrity_pool::instruction::UpdateRewardProgramAuthority {
        reward_program_authority: *new_reward_program_authority,
    };

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[signer]);
}

pub fn slash(
    rpc_client: &RpcClient,
    signer: &Keypair,
    publisher: &Pubkey,
    stake_account_positions: &Pubkey,
) {
    let pool_config = get_pool_config_address();
    let PoolConfig {
        pool_data,
        slash_custody,
        ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let delegation_record = get_delegation_record_address(*publisher, *stake_account_positions);
    let DelegationRecord {
        next_slash_event_index,
        ..
    } = {
        let delegation_record_account_data = rpc_client.get_account_data(&delegation_record);
        if let Ok(data) = delegation_record_account_data {
            DelegationRecord::try_deserialize(&mut data.as_slice()).unwrap()
        } else {
            DelegationRecord {
                last_epoch:             0,
                next_slash_event_index: 0,
            }
        }
    };


    let stake_account_metadata = get_stake_account_metadata_address(*stake_account_positions);
    let stake_account_custody = get_stake_account_custody_address(*stake_account_positions);
    let custody_authority = get_stake_account_custody_authority_address(*stake_account_positions);
    let config_account = get_config_address();
    let governance_target_account = get_target_address();


    let accounts = integrity_pool::accounts::Slash {
        signer: signer.pubkey(),
        pool_data,
        pool_config,
        slash_event: get_slash_event_address(next_slash_event_index, *publisher),
        delegation_record,
        publisher: *publisher,
        stake_account_positions: *stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        config_account,
        governance_target_account,
        slash_custody,
        custody_authority,
        staking_program: staking::ID,
        token_program: spl_token::ID,
    };

    let instruction_data = integrity_pool::instruction::Slash {
        index: next_slash_event_index,
    };

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[signer]);
}

pub fn update_y(rpc_client: &RpcClient, signer: &Keypair, y: u64) {
    let pool_config = get_pool_config_address();

    let accounts = integrity_pool::accounts::UpdateY {
        reward_program_authority: signer.pubkey(),
        pool_config,
        system_program: system_program::ID,
    };

    let instruction_data = integrity_pool::instruction::UpdateY { y };

    let instruction = Instruction {
        program_id: integrity_pool::ID,
        accounts:   accounts.to_account_metas(None),
        data:       instruction_data.data(),
    };

    process_transaction(rpc_client, &[instruction], &[signer]);
}
