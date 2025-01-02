use {
    anchor_lang::{
        pubkey,
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
    futures::{
        future::join_all,
        StreamExt,
    },
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
        // rpc_client::RpcClient,
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
                DynamicPositionArray,
                DynamicPositionArrayAccount,
                PositionData,
                PositionState,
                Target,
                TargetWithParameters,
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
    wormhole_core_bridge_solana::{
        sdk::{
            WriteEncodedVaaArgs,
            VAA_START,
        },
        state::EncodedVaa,
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


pub async fn process_transaction(
    rpc_client: &RpcClient,
    instructions: &[Instruction],
    signers: &[&dyn Signer],
) -> Result<(), Option<TransactionError>> {
    let mut instructions = instructions.to_vec();
    instructions.push(ComputeBudgetInstruction::set_compute_unit_price(10000));
    let mut transaction = Transaction::new_with_payer(&instructions, Some(&signers[0].pubkey()));
    transaction.sign(
        signers,
        rpc_client
            .get_latest_blockhash_with_commitment(CommitmentConfig::finalized())
            .await
            .unwrap()
            .0,
    );
    for _ in 0..10 {
        rpc_client
            .send_transaction_with_config(
                &transaction,
                RpcSendTransactionConfig {
                    skip_preflight: true,
                    max_retries: Some(0),
                    ..Default::default()
                },
            )
            .await
            .unwrap();

        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    Ok(())
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

pub struct FetchError {}

pub async fn fetch_delegation_record(
    rpc_client: &RpcClient,
    key: Pubkey,
) -> Result<DelegationRecord, FetchError> {
    let delegation_record = DelegationRecord::try_deserialize(
        &mut (rpc_client
            .get_account_data(&key)
            .await
            .map_err(|_| FetchError {})?
            .as_slice()),
    )
    .map_err(|_| FetchError {})?;

    Ok(delegation_record)
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
            Err(_) => {}
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
