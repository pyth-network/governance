use {
    anchor_lang::{
        AccountDeserialize,
        Discriminator,
        InstructionData,
        ToAccountMetas,
    },
    anchor_spl::{
        associated_token::spl_associated_token_account,
        token::{
            spl_token,
            TokenAccount,
        },
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
    integrity_pool::{
        state::{
            delegation_record::DelegationRecord,
            pool::{
                PoolConfig,
                PoolData,
            },
        },
        utils::clock::EPOCH_DURATION,
    },
    publisher_caps::PublisherCaps,
    pythnet_sdk::wire::v1::{
        AccumulatorUpdateData,
        MerklePriceUpdate,
        Proof,
    },
    reqwest::blocking::Client,
    serde_wormhole::RawMessage,
    solana_account_decoder::UiAccountEncoding,
    solana_client::{
        nonblocking::rpc_client::RpcClient,
        rpc_config::{
            RpcAccountInfoConfig,
            RpcProgramAccountsConfig,
            RpcSendTransactionConfig,
        },
        rpc_filter::{
            Memcmp,
            MemcmpEncodedBytes,
            RpcFilterType,
        },
    },
    solana_sdk::{
        commitment_config::CommitmentConfig,
        compute_budget::ComputeBudgetInstruction,
        instruction::Instruction,
        pubkey::Pubkey,
        rent::Rent,
        signature::{
            Keypair,
            Signature,
        },
        signer::Signer,
        system_instruction::{
            self,
            create_account,
        },
        system_program,
        transaction::{
            Transaction,
            TransactionError,
        },
    },
    staking::{
        state::{
            global_config::GlobalConfig,
            max_voter_weight_record::MAX_VOTER_WEIGHT,
            positions::{
                DynamicPositionArrayAccount,
                PositionData,
                PositionState,
            },
            stake_account::StakeAccountMetadataV2,
        },
        utils::voter_weight::compute_voter_weight,
    },
    std::{
        cmp::min,
        collections::HashMap,
        convert::TryInto,
        fs::File,
        io::{
            BufWriter,
            Write,
        },
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

pub async fn init_publisher_caps(rpc_client: &RpcClient, payer: &dyn Signer) -> Pubkey {
    let publisher_caps = Keypair::new();
    let create_account_ix = create_account(
        &payer.pubkey(),
        &publisher_caps.pubkey(),
        rpc_client
            .get_minimum_balance_for_rent_exemption(PublisherCaps::LEN)
            .await
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
    )
    .await
    .unwrap();
    publisher_caps.pubkey()
}

pub async fn write_publisher_caps(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
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

    process_transaction(rpc_client, &[instruction], &[payer])
        .await
        .unwrap();
}

pub async fn close_publisher_caps(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
    publisher_caps: Pubkey,
) {
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

    process_transaction(rpc_client, &[instruction], &[payer])
        .await
        .unwrap();
}

pub async fn verify_publisher_caps(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
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
    )
    .await
    .unwrap();
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

pub async fn process_transaction(
    rpc_client: &RpcClient,
    instructions: &[Instruction],
    signers: &[&dyn Signer],
) -> Result<Signature, Option<TransactionError>> {
    let mut transaction = Transaction::new_with_payer(instructions, Some(&signers[0].pubkey()));
    transaction.sign(
        signers,
        rpc_client
            .get_latest_blockhash_with_commitment(CommitmentConfig::finalized())
            .await
            .unwrap()
            .0,
    );
    let transaction_signature_res = rpc_client
        .send_and_confirm_transaction_with_spinner_and_config(
            &transaction,
            CommitmentConfig::confirmed(),
            RpcSendTransactionConfig {
                skip_preflight: true,
                ..Default::default()
            },
        )
        .await;
    match transaction_signature_res {
        Ok(signature) => {
            println!("Transaction successful : {signature:?}");
            Ok(signature)
        }
        Err(err) => {
            println!("transaction err: {err:?}");
            Err(err.get_transaction_error())
        }
    }
}

pub async fn process_write_encoded_vaa(
    rpc_client: &RpcClient,
    vaa: &[u8],
    wormhole: Pubkey,
    payer: &dyn Signer,
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
    )
    .await
    .unwrap();

    for i in (0..vaa.len()).step_by(1000) {
        let chunk = &vaa[i..min(i + 1000, vaa.len())];

        write_encoded_vaa(
            rpc_client,
            payer,
            &encoded_vaa_keypair.pubkey(),
            &wormhole,
            i,
            chunk,
        )
        .await;
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
    )
    .await
    .unwrap();


    encoded_vaa_keypair.pubkey()
}

pub async fn write_encoded_vaa(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
    encoded_vaa: &Pubkey,
    wormhole: &Pubkey,
    index: usize,
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
                index: index as u32,
                data:  chunk.to_vec(),
            },
        }
        .data(),
    };

    process_transaction(
        rpc_client,
        &[write_encoded_vaa_accounts_instruction],
        &[payer],
    )
    .await
    .unwrap();
}

pub async fn close_encoded_vaa(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
    encoded_vaa: Pubkey,
    wormhole: &Pubkey,
) {
    let close_encoded_vaa_accounts = wormhole_core_bridge_solana::accounts::CloseEncodedVaa {
        write_authority: payer.pubkey(),
        encoded_vaa,
    }
    .to_account_metas(None);

    let close_encoded_vaa_instruction = Instruction {
        program_id: *wormhole,
        accounts:   close_encoded_vaa_accounts,
        data:       wormhole_core_bridge_solana::instruction::CloseEncodedVaa {}.data(),
    };

    process_transaction(rpc_client, &[close_encoded_vaa_instruction], &[payer])
        .await
        .unwrap();
}

pub async fn initialize_reward_custody(rpc_client: &RpcClient, payer: &dyn Signer) {
    let pool_config = get_pool_config_address();

    let PoolConfig {
        pyth_token_mint, ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .await
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

    process_transaction(rpc_client, &[create_ata_ix], &[payer])
        .await
        .unwrap();
}

pub async fn advance(rpc_client: &RpcClient, payer: &dyn Signer, publisher_caps: Pubkey) {
    let pool_config = get_pool_config_address();

    let PoolConfig {
        pool_data,
        pyth_token_mint,
        ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .await
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
    )
    .await
    .unwrap();
}

pub async fn initialize_pool(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
    pool_data_keypair: &Keypair,
    reward_program_authority: Pubkey,
    y: u64,
    slash_custody: Pubkey,
) {
    let pool_data_space: u64 = PoolData::LEN.try_into().unwrap();
    let config_address = get_config_address();

    let rent = rpc_client
        .get_minimum_balance_for_rent_exemption(pool_data_space.try_into().unwrap())
        .await
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
    )
    .await
    .unwrap();
}

pub async fn get_current_time(rpc_client: &RpcClient) -> i64 {
    let slot = rpc_client.get_slot().await.unwrap();
    rpc_client.get_block_time(slot).await.unwrap()
}

pub async fn get_current_epoch(rpc_client: &RpcClient) -> u64 {
    let slot = rpc_client.get_slot().await.unwrap();
    let blocktime = rpc_client.get_block_time(slot).await.unwrap();
    blocktime as u64 / EPOCH_DURATION
}

pub async fn fetch_publisher_caps_and_advance(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
    wormhole: Pubkey,
    hermes_url: String,
) {
    let pool_config = get_pool_config_address();

    let PoolConfig {
        pool_data: pool_data_address,
        ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .await
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let pool_data = PoolData::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_data_address)
            .await
            .unwrap()[..8 + size_of::<PoolData>()]
            .as_ref(),
    )
    .unwrap();

    if pool_data.last_updated_epoch == get_current_epoch(rpc_client).await {
        println!("Pool data is already updated");
        return;
    }

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

    let encoded_vaa = process_write_encoded_vaa(rpc_client, vaa.as_slice(), wormhole, payer).await;

    let publisher_caps = init_publisher_caps(rpc_client, payer).await;

    let publisher_caps_message_bytes =
        Vec::<u8>::from(merkle_proofs.first().unwrap().message.clone());


    for i in (0..publisher_caps_message_bytes.len()).step_by(1000) {
        let chunk =
            &publisher_caps_message_bytes[i..min(i + 1000, publisher_caps_message_bytes.len())];

        write_publisher_caps(rpc_client, payer, publisher_caps, i, chunk).await;
    }

    verify_publisher_caps(
        rpc_client,
        payer,
        publisher_caps,
        encoded_vaa,
        merkle_proofs,
    )
    .await;

    println!(
        "Initialized publisher caps with pubkey : {:?}",
        publisher_caps
    );

    advance(rpc_client, payer, publisher_caps).await;
    close_publisher_caps(rpc_client, payer, publisher_caps).await;
    close_encoded_vaa(rpc_client, payer, encoded_vaa, &wormhole).await;
}

pub async fn update_delegation_fee(
    rpc_client: &RpcClient,
    payer: &dyn Signer,
    delegation_fee: u64,
) {
    let pool_config = get_pool_config_address();

    let PoolConfig { pool_data, .. } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .await
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

    process_transaction(rpc_client, &[instruction], &[payer])
        .await
        .unwrap();
}

pub async fn set_publisher_stake_account(
    rpc_client: &RpcClient,
    signer: &dyn Signer,
    publisher: &Pubkey,
    stake_account_positions: &Pubkey,
) {
    let pool_config = get_pool_config_address();

    let PoolConfig { pool_data, .. } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .await
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

    process_transaction(rpc_client, &[instruction], &[signer])
        .await
        .unwrap();
}

pub async fn create_slash_event(
    rpc_client: &RpcClient,
    signer: &dyn Signer,
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
            .await
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let pool_data = PoolData::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_data_address)
            .await
            .unwrap()[..8 + size_of::<PoolData>()]
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

    process_transaction(rpc_client, &[instruction], &[signer])
        .await
        .unwrap();
}

pub async fn update_reward_program_authority(
    rpc_client: &RpcClient,
    signer: &dyn Signer,
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

    process_transaction(rpc_client, &[instruction], &[signer])
        .await
        .unwrap();
}

pub async fn slash(
    rpc_client: &RpcClient,
    signer: &dyn Signer,
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
            .await
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let delegation_record = get_delegation_record_address(*publisher, *stake_account_positions);
    let DelegationRecord {
        next_slash_event_index,
        ..
    } = {
        let delegation_record_account_data = rpc_client.get_account_data(&delegation_record).await;
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

    process_transaction(rpc_client, &[instruction], &[signer])
        .await
        .unwrap();
}

pub async fn update_y(rpc_client: &RpcClient, signer: &dyn Signer, y: u64) {
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

    process_transaction(rpc_client, &[instruction], &[signer])
        .await
        .unwrap();
}

pub async fn close_all_publisher_caps(rpc_client: &RpcClient, signer: &dyn Signer) {
    let accounts = rpc_client
        .get_program_accounts_with_config(
            &publisher_caps::ID,
            RpcProgramAccountsConfig {
                filters:        Some(vec![RpcFilterType::Memcmp(Memcmp::new(
                    0,
                    MemcmpEncodedBytes::Bytes(PublisherCaps::DISCRIMINATOR.to_vec()),
                ))]),
                account_config: RpcAccountInfoConfig {
                    encoding:         Some(UiAccountEncoding::Base64Zstd),
                    data_slice:       None,
                    commitment:       None,
                    min_context_slot: None,
                },
                with_context:   None,
            },
        )
        .await
        .unwrap();

    for (pubkey, _account) in accounts {
        close_publisher_caps(rpc_client, signer, pubkey).await;
    }
}

pub async fn save_stake_accounts_snapshot(rpc_client: &RpcClient) {
    let data: Vec<(Pubkey, DynamicPositionArrayAccount, Pubkey, Pubkey, Pubkey)> = rpc_client
        .get_program_accounts_with_config(
            &staking::ID,
            RpcProgramAccountsConfig {
                filters:        Some(vec![RpcFilterType::Memcmp(Memcmp::new(
                    0,
                    MemcmpEncodedBytes::Bytes(PositionData::discriminator().to_vec()),
                ))]),
                account_config: RpcAccountInfoConfig {
                    encoding:         Some(UiAccountEncoding::Base64Zstd),
                    data_slice:       None,
                    commitment:       None,
                    min_context_slot: None,
                },
                with_context:   None,
            },
        )
        .await
        .unwrap()
        .into_iter()
        .map(|(pubkey, account)| {
            (
                pubkey,
                DynamicPositionArrayAccount {
                    key:      pubkey,
                    lamports: account.lamports,
                    data:     account.data.clone(),
                },
                get_stake_account_metadata_address(pubkey),
                get_stake_account_custody_address(pubkey),
                get_stake_account_custody_authority_address(pubkey),
            )
        })
        .collect::<Vec<_>>();

    let metadata_accounts_data = rpc_client
        .get_program_accounts_with_config(
            &staking::ID,
            RpcProgramAccountsConfig {
                filters:        Some(vec![RpcFilterType::Memcmp(Memcmp::new(
                    0,
                    MemcmpEncodedBytes::Bytes(StakeAccountMetadataV2::discriminator().to_vec()),
                ))]),
                account_config: RpcAccountInfoConfig {
                    encoding:         Some(UiAccountEncoding::Base64Zstd),
                    data_slice:       None,
                    commitment:       None,
                    min_context_slot: None,
                },
                with_context:   None,
            },
        )
        .await
        .unwrap()
        .into_iter()
        .map(|(pubkey, account)| {
            (
                pubkey,
                StakeAccountMetadataV2::try_deserialize(&mut account.data.as_slice()).unwrap(),
            )
        })
        .collect::<Vec<_>>();

    let config = GlobalConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&get_config_address())
            .await
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let current_time = get_current_time(rpc_client).await;

    let metadata_account_data_locked: HashMap<Pubkey, u64> = metadata_accounts_data
        .iter()
        .map(|(pubkey, metadata)| {
            (
                *pubkey,
                metadata
                    .lock
                    .get_unvested_balance(current_time, config.pyth_token_list_time)
                    .unwrap(),
            )
        })
        .collect::<HashMap<Pubkey, u64>>();

    let data = data
        .into_iter()
        .map(
            |(pubkey, account, metadata_pubkey, custody_pubkey, custody_authority_pubkey)| {
                (
                    pubkey,
                    account,
                    metadata_pubkey,
                    custody_pubkey,
                    custody_authority_pubkey,
                    *metadata_account_data_locked.get(&metadata_pubkey).unwrap(),
                )
            },
        )
        .collect::<Vec<_>>();

    // We need to check the actual tokens accounts, since you can initialize a stake account with an
    // arbitrary vesting schedule but 0 tokens
    let locked_token_accounts_pubkeys = data
        .iter()
        .filter(|(_, _, _, _, _, locked_amount)| *locked_amount > 0u64)
        .map(|(_, _, _, token_account_pubkey, _, _)| *token_account_pubkey)
        .collect::<Vec<_>>();

    let mut locked_token_accounts_actual_amounts: HashMap<Pubkey, u64> = HashMap::new();
    for chunk in locked_token_accounts_pubkeys.chunks(100) {
        rpc_client
            .get_multiple_accounts(chunk)
            .await
            .unwrap()
            .into_iter()
            .enumerate()
            .for_each(|(index, account)| {
                locked_token_accounts_actual_amounts.insert(
                    chunk[index],
                    TokenAccount::try_deserialize(&mut account.unwrap().data.as_slice())
                        .unwrap()
                        .amount,
                );
            });
    }

    let data = data
        .into_iter()
        .map(
            |(
                pubkey,
                account,
                metadata_pubkey,
                custody_pubkey,
                custody_authority_pubkey,
                locked_amount,
            )| {
                (
                    pubkey,
                    account,
                    metadata_pubkey,
                    custody_pubkey,
                    custody_authority_pubkey,
                    min(
                        locked_amount,
                        *locked_token_accounts_actual_amounts
                            .get(&custody_pubkey)
                            .unwrap_or(&0u64),
                    ),
                )
            },
        )
        .collect::<Vec<_>>();

    let current_epoch = get_current_epoch(rpc_client).await;
    let data = data
        .into_iter()
        .map(
            |(
                pubkey,
                mut account,
                metadata_pubkey,
                custody_pubkey,
                custody_authority_pubkey,
                locked_amount,
            )| {
                let dynamic_position_array = account.to_dynamic_position_array();
                let owner = dynamic_position_array.owner().unwrap();
                let staked_in_governance = compute_voter_weight(
                    &dynamic_position_array,
                    current_epoch,
                    MAX_VOTER_WEIGHT,
                    MAX_VOTER_WEIGHT,
                )
                .unwrap();

                let staked_in_ois = {
                    let mut amount = 0u64;
                    for i in 0..dynamic_position_array.get_position_capacity() {
                        if let Some(position) = dynamic_position_array.read_position(i).unwrap() {
                            match position.get_current_position(current_epoch).unwrap() {
                                PositionState::LOCKED | PositionState::PREUNLOCKING => {
                                    if !position.is_voting() {
                                        amount += position.amount;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    amount
                };
                (
                    pubkey,
                    metadata_pubkey,
                    custody_pubkey,
                    custody_authority_pubkey,
                    owner,
                    locked_amount,
                    staked_in_governance,
                    staked_in_ois,
                )
            },
        )
        .collect::<Vec<_>>();

    if !std::path::Path::new("snapshots").exists() {
        std::fs::create_dir_all("snapshots").unwrap();
    }

    let timestamp = chrono::Utc::now().format("%Y-%m-%d_%H:%M:%S").to_string();
    let file = File::create(format!("snapshots/snapshot-{}.csv", timestamp)).unwrap();
    let mut writer = BufWriter::new(file);

    // Write the header
    writeln!(writer, "positions_pubkey,metadata_pubkey,custody_pubkey,custody_authority_pubkey,owner,locked_amount,staked_in_governance,staked_in_ois").unwrap();
    // Write the data
    for (
        pubkey,
        metadata_pubkey,
        custody_pubkey,
        custody_authority_pubkey,
        owner,
        locked_amount,
        staked_in_governance,
        staked_in_ois,
    ) in data
    {
        writeln!(
            writer,
            "{},{},{},{},{},{},{},{}",
            pubkey,
            metadata_pubkey,
            custody_pubkey,
            custody_authority_pubkey,
            owner,
            locked_amount,
            staked_in_governance,
            staked_in_ois
        )
        .unwrap();
    }
}

pub async fn advance_delegation_record<'a>(
    rpc_client: &RpcClient,
    signer: &dyn Signer,
    positions: &DynamicPositionArray<'a>,
    min_reward: u64,
    current_epoch: u64,
    pool_data: &PoolData,
    pool_data_address: &Pubkey,
    pyth_token_mint: &Pubkey,
    pool_config: &Pubkey,
    index: usize,
) -> bool {
    let positions_pubkey = positions.acc_info.key;

    // First collect all potential instruction data
    let potential_instructions: Vec<_> = pool_data
        .publishers
        .iter()
        .enumerate()
        .filter_map(|(publisher_index, publisher)| {
            if *publisher == Pubkey::default() {
                return None;
            }

            let publisher_exposure = {
                let mut publisher_exposure = 0;
                for i in 0..positions.get_position_capacity() {
                    if let Some(position) = positions.read_position(i).unwrap() {
                        if (position.target_with_parameters
                            == TargetWithParameters::IntegrityPool {
                                publisher: *publisher,
                            })
                        {
                            publisher_exposure += position.amount;
                        }
                    }
                }
                publisher_exposure
            };

            if publisher_exposure == 0 {
                return None;
            }

            let publisher_stake_account_positions =
                if pool_data.publisher_stake_accounts[publisher_index] == Pubkey::default() {
                    None
                } else {
                    Some(pool_data.publisher_stake_accounts[publisher_index])
                };

            let publisher_stake_account_custody =
                publisher_stake_account_positions.map(get_stake_account_custody_address);

            Some((
                *publisher,
                publisher_stake_account_positions,
                publisher_stake_account_custody,
            ))
        })
        .collect();

    println!(
        "Position {:?} with index {} has {} potential instructions",
        positions_pubkey,
        index,
        potential_instructions.len()
    );

    // Fetch all delegation records concurrently
    let delegation_records = join_all(potential_instructions.iter().map(|(publisher, _, _)| {
        let delegation_record_pubkey = get_delegation_record_address(*publisher, *positions_pubkey);
        fetch_delegation_record(rpc_client, delegation_record_pubkey)
    }))
    .await;

    // Process results and create instructions
    let mut instructions = Vec::new();
    for (
        (publisher, publisher_stake_account_positions, publisher_stake_account_custody),
        delegation_record,
    ) in potential_instructions.into_iter().zip(delegation_records)
    {
        // Skip if we couldn't fetch the record or if it's already processed for current epoch
        match delegation_record {
            Ok(delegation_record) => {
                if delegation_record.last_epoch == current_epoch {
                    continue;
                }
            }
            Err(_) => {
                continue;
            }
        }

        let accounts = integrity_pool::accounts::AdvanceDelegationRecord {
            delegation_record: get_delegation_record_address(publisher, *positions_pubkey),
            payer: signer.pubkey(),
            pool_config: *pool_config,
            pool_data: *pool_data_address,
            pool_reward_custody: get_pool_reward_custody_address(*pyth_token_mint),
            publisher,
            publisher_stake_account_positions,
            publisher_stake_account_custody,
            stake_account_positions: *positions_pubkey,
            stake_account_custody: get_stake_account_custody_address(*positions_pubkey),
            system_program: system_program::ID,
            token_program: spl_token::ID,
        };

        let data = integrity_pool::instruction::AdvanceDelegationRecord {};

        instructions.push(Instruction {
            program_id: integrity_pool::ID,
            accounts:   accounts.to_account_metas(None),
            data:       data.data(),
        });
    }

    // Process instructions in chunks of 5
    if !instructions.is_empty() {
        println!(
            "Advancing delegation record for pubkey: {:?}, number of instructions: {}",
            positions_pubkey.to_string(),
            instructions.len(),
        );

        for chunk in instructions.chunks(5) {
            process_transaction(rpc_client, chunk, &[signer])
                .await
                .unwrap();
        }
        return true; // Instructions were processed
    }
    false // No instructions were processed
}

pub async fn claim_rewards(
    rpc_client: &RpcClient,
    signer: &dyn Signer,
    min_staked: u64,
    min_reward: u64,
) {
    let mut data: Vec<DynamicPositionArrayAccount> = rpc_client
        .get_program_accounts_with_config(
            &staking::ID,
            RpcProgramAccountsConfig {
                filters:        Some(vec![RpcFilterType::Memcmp(Memcmp::new(
                    0,
                    MemcmpEncodedBytes::Bytes(PositionData::discriminator().to_vec()),
                ))]),
                account_config: RpcAccountInfoConfig {
                    encoding:         Some(UiAccountEncoding::Base64Zstd),
                    data_slice:       None,
                    commitment:       None,
                    min_context_slot: None,
                },
                with_context:   None,
            },
        )
        .await
        .unwrap()
        .into_iter()
        .map(|(pubkey, account)| DynamicPositionArrayAccount {
            key:      pubkey,
            lamports: account.lamports,
            data:     account.data.clone(),
        })
        .collect::<Vec<_>>();

    let current_epoch = get_current_epoch(rpc_client).await;

    let mut data: Vec<(u64, DynamicPositionArray)> = data
        .iter_mut()
        .filter_map(|positions| {
            let acc = positions.to_dynamic_position_array();
            let exposure = acc
                .get_target_exposure(&Target::IntegrityPool, current_epoch)
                .unwrap();
            if exposure >= min_staked {
                Some((exposure, acc))
            } else {
                None
            }
        })
        .collect();

    data.sort_by_key(|(exposure, _)| *exposure);
    data.reverse();


    let pool_config = get_pool_config_address();

    let PoolConfig {
        pool_data: pool_data_address,
        pyth_token_mint,
        ..
    } = PoolConfig::try_deserialize(
        &mut rpc_client
            .get_account_data(&pool_config)
            .await
            .unwrap()
            .as_slice(),
    )
    .unwrap();

    let pool_data = PoolData::try_deserialize(
        &mut &rpc_client
            .get_account_data(&pool_data_address)
            .await
            .unwrap()
            .as_slice()[..8 + size_of::<PoolData>()],
    )
    .unwrap();

    println!("Processing {} accounts", data.len());
    // Initialize results vector with true to process all indexes in first round
    let mut active_positions = vec![true; data.len()];

    loop {
        let futures = data
            .iter()
            .enumerate()
            .filter(|(i, _)| active_positions[*i])
            .map(|(i, (_, positions))| {
                advance_delegation_record(
                    rpc_client,
                    signer,
                    positions,
                    min_reward,
                    current_epoch,
                    &pool_data,
                    &pool_data_address,
                    &pyth_token_mint,
                    &pool_config,
                    i,
                )
            })
            .collect::<Vec<_>>();

        let futures = tokio_stream::iter(futures);
        let results = futures.buffered(20).collect::<Vec<_>>().await;

        println!("Finished processing {} accounts", results.len());
        // Update active_positions based on results
        let mut result_index = 0;
        for i in 0..active_positions.len() {
            if active_positions[i] {
                active_positions[i] = results[result_index];
                result_index += 1;
            }
        }

        // If no delegations were advanced, we're done
        if !results.iter().any(|&active| active) {
            break;
        }


        println!("We will retry after 10 seconds!");
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    }
}