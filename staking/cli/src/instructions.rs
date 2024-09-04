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

pub fn init_publisher_caps(rpc_client: &RpcClient, payer: &Keypair, publisher_caps: &Keypair) {
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
        &[payer, publisher_caps],
    );
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
        &[payer],
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
        payer:          payer.pubkey(),
        pool_data:      pool_data_keypair.pubkey(),
        pool_config:    pool_config_pubkey,
        config_account: config_address,
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
    _hermes_url: String,
) {
    //TODO: actually fetch the message from hermes
    let encoded_message = "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";

    //decode tmp from base64
    let message = base64::prelude::BASE64_STANDARD
        .decode(encoded_message)
        .unwrap();

    let (vaa, merkle_proofs) = deserialize_accumulator_update_data(message);


    let encoded_vaa = process_write_encoded_vaa(rpc_client, vaa.as_slice(), wormhole, payer);


    let publisher_caps = Keypair::new();


    init_publisher_caps(rpc_client, payer, &publisher_caps);


    let publisher_caps_message_bytes =
        Vec::<u8>::from(merkle_proofs.first().unwrap().message.clone());


    for i in (0..publisher_caps_message_bytes.len()).step_by(1000) {
        let chunk =
            &publisher_caps_message_bytes[i..min(i + 1000, publisher_caps_message_bytes.len())];

        write_publisher_caps(rpc_client, payer, publisher_caps.pubkey(), i, chunk);
    }

    verify_publisher_caps(
        rpc_client,
        payer,
        publisher_caps.pubkey(),
        encoded_vaa,
        merkle_proofs,
    );


    println!(
        "Initialized publisher caps with pubkey : {:?}",
        publisher_caps.pubkey()
    );

    advance(rpc_client, payer, publisher_caps.pubkey());
}
