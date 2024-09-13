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
            get_pool_config_address,
            get_pool_reward_custody_address,
        },
        staking::pda::get_config_address,
    },
    integrity_pool::state::pool::{
        PoolConfig,
        PoolData,
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

    let write_encoded_vaa_accounts = wormhole_core_bridge_solana::accounts::WriteEncodedVaa {
        write_authority: payer.pubkey(),
        draft_vaa:       encoded_vaa_keypair.pubkey(),
    }
    .to_account_metas(None);

    let write_encoded_vaa_accounts_instruction = Instruction {
        program_id: wormhole,
        accounts:   write_encoded_vaa_accounts.clone(),
        data:       wormhole_core_bridge_solana::instruction::WriteEncodedVaa {
            args: WriteEncodedVaaArgs {
                index: 0,
                data:  vaa.to_vec(),
            },
        }
        .data(),
    };

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
            create_encoded_vaa,
            init_encoded_vaa_instruction,
            write_encoded_vaa_accounts_instruction,
            verify_encoded_vaa_instruction,
            request_compute_units_instruction,
        ],
        &[payer, &encoded_vaa_keypair],
    );


    encoded_vaa_keypair.pubkey()
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
