use {
    anchor_spl::token::TokenAccount,
    integration_tests::{
        assert_anchor_program_error,
        integrity_pool::{
            helper_functions::initialize_pool_reward_custody,
            instructions::{
                advance,
                advance_delegation_record,
                create_slash_event,
                delegate,
                merge_delegation_positions,
                slash,
                undelegate,
                update_y,
            },
        },
        publisher_caps::helper_functions::post_publisher_caps,
        setup::{
            setup,
            SetupProps,
            SetupResult,
        },
        solana::{
            instructions::create_token_account,
            utils::{
                fetch_account_data,
                fetch_account_data_bytemuck,
                fetch_positions_account,
            },
        },
        staking::{
            helper_functions::initialize_new_stake_account,
            instructions::{
                close_position,
                create_position,
            },
            pda::get_stake_account_custody_address,
        },
        utils::clock::{
            advance_n_epochs,
            get_current_epoch,
        },
    },
    integrity_pool::{
        state::pool::PoolData,
        utils::{
            clock::UNLOCKING_DURATION,
            constants::MAX_PUBLISHERS,
            types::FRAC_64_MULTIPLIER,
        },
    },
    litesvm::LiteSVM,
    quickcheck::{
        Arbitrary,
        Gen,
        QuickCheck,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
    staking::{
        error::ErrorCode as StakingErrorCode,
        state::positions::{
            Position,
            PositionState,
            Target,
            TargetWithParameters,
        },
    },
    std::{
        cmp::min,
        collections::HashMap,
        convert::TryInto,
        fmt::Debug,
    },
};

// These constants define the parameters of the stability test.
const MAX_DELEGATION_AMOUNT: u64 = 2 * FRAC_64_MULTIPLIER;
const MAX_UNDELEGATION_AMOUNT: u64 = FRAC_64_MULTIPLIER / 10;
const NUM_DELEGATORS: u64 = 1_000;
const NUM_OPERATIONS: u64 = 10_000;
const MAX_CAP: u64 = 100 * FRAC_64_MULTIPLIER;
const Y: u64 = FRAC_64_MULTIPLIER / 10 / 52;

#[derive(Debug)]
struct KeypairWrapper(Keypair);

impl Clone for KeypairWrapper {
    fn clone(&self) -> Self {
        KeypairWrapper(self.0.insecure_clone())
    }
}

#[derive(Debug, Clone)]
enum Operation {
    Delegate {
        publisher: usize,
        delegator: usize,
        amount:    u64,
    },
    Undelegate {
        publisher: usize,
        delegator: usize,
        amount:    u64,
    },
    AdvanceDelegationRecord {
        publisher: usize,
        delegator: usize,
    },
    Advance {
        cap: u64,
    },
    Slash {
        publisher: usize,
        amount:    u64,
    },
    MergePositions {
        publisher: usize,
        delegator: usize,
    },
    CreateGovernancePosition {
        delegator: usize,
        amount:    u64,
    },
    CloseGovernancePosition {
        delegator: usize,
        amount:    u64,
    },
}

impl Operation {
    fn get_name(&self) -> String {
        match self {
            Operation::Delegate { .. } => "Delegate".to_string(),
            Operation::Undelegate { .. } => "Undelegate".to_string(),
            Operation::AdvanceDelegationRecord { .. } => "AdvanceDelegationRecord".to_string(),
            Operation::Advance { .. } => "Advance".to_string(),
            Operation::Slash { .. } => "Slash".to_string(),
            Operation::MergePositions { .. } => "MergePositions".to_string(),
            Operation::CreateGovernancePosition { .. } => "CreateGovernancePosition".to_string(),
            Operation::CloseGovernancePosition { .. } => "CloseGovernancePosition".to_string(),
        }
    }
}

#[derive(Clone)]
struct StabilityTestProps {
    operations: Vec<Operation>,
    publishers: Vec<KeypairWrapper>,
    delegators: Vec<KeypairWrapper>,
}

impl Debug for StabilityTestProps {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("StabilityTestProps")
    }
}

impl Arbitrary for StabilityTestProps {
    fn arbitrary(g: &mut Gen) -> Self {
        let publishers: Vec<KeypairWrapper> = (0..(MAX_PUBLISHERS - 10))
            .map(|_| KeypairWrapper(Keypair::new()))
            .collect();

        let delegators: Vec<KeypairWrapper> = (0..NUM_DELEGATORS)
            .map(|_| KeypairWrapper(Keypair::new()))
            .collect();

        let mut operations = vec![];
        for _ in 0..NUM_OPERATIONS {
            let operation = get_random_operation(g, &operations, &publishers, &delegators);
            operations.push(operation);
        }

        StabilityTestProps {
            operations,
            publishers,
            delegators,
        }
    }
}

type OperationWrapper =
    Box<dyn Fn(&mut Gen, &[Operation], &[KeypairWrapper], &[KeypairWrapper]) -> Operation>;

struct OperationWeight {
    weight:    u64,
    operation: OperationWrapper,
}

fn get_random_operation(
    g: &mut Gen,
    prev_operations: &[Operation],
    publishers: &[KeypairWrapper],
    delegators: &[KeypairWrapper],
) -> Operation {
    let operations = vec![
        OperationWeight {
            weight:    500,
            operation: Box::new(
                |g, _operations, publishers, delegators| Operation::Delegate {
                    publisher: usize::arbitrary(g) % publishers.len(),
                    delegator: usize::arbitrary(g) % delegators.len(),
                    amount:    u64::arbitrary(g) % MAX_DELEGATION_AMOUNT + 1,
                },
            ),
        },
        OperationWeight {
            weight:    250,
            operation: Box::new(|g, operations, publishers, delegators| {
                let del_ops: Vec<&Operation> = operations
                    .iter()
                    .filter(|op| matches!(op, Operation::Delegate { .. }))
                    .collect();
                let del_op = g.choose(&del_ops);
                if let Some(Operation::Delegate {
                    publisher,
                    delegator,
                    amount,
                }) = del_op
                {
                    Operation::Undelegate {
                        publisher: *publisher,
                        delegator: *delegator,
                        amount:    min(u64::arbitrary(g) % MAX_UNDELEGATION_AMOUNT + 1, *amount),
                    }
                } else {
                    Operation::Undelegate {
                        publisher: usize::arbitrary(g) % publishers.len(),
                        delegator: usize::arbitrary(g) % delegators.len(),
                        amount:    u64::arbitrary(g) % MAX_UNDELEGATION_AMOUNT + 1,
                    }
                }
            }),
        },
        OperationWeight {
            weight:    250,
            operation: Box::new(|g, _operations, publishers, delegators| {
                Operation::AdvanceDelegationRecord {
                    publisher: usize::arbitrary(g) % publishers.len(),
                    delegator: usize::arbitrary(g) % delegators.len(),
                }
            }),
        },
        OperationWeight {
            weight:    10,
            operation: Box::new(
                |g, _operations, _publishers, _delegators| Operation::Advance {
                    cap: u64::arbitrary(g) % MAX_CAP + 1,
                },
            ),
        },
        OperationWeight {
            weight:    1,
            operation: Box::new(|g, _operations, publishers, _delegators| Operation::Slash {
                publisher: usize::arbitrary(g) % publishers.len(),
                amount:    u64::arbitrary(g) % (FRAC_64_MULTIPLIER - 1) + 1,
            }),
        },
        OperationWeight {
            weight:    100,
            operation: Box::new(|g, _operations, publishers, delegators| {
                Operation::MergePositions {
                    publisher: usize::arbitrary(g) % publishers.len(),
                    delegator: usize::arbitrary(g) % delegators.len(),
                }
            }),
        },
        OperationWeight {
            weight:    100,
            operation: Box::new(|g, _operations, _publishers, delegators| {
                Operation::CreateGovernancePosition {
                    amount:    u64::arbitrary(g) % MAX_DELEGATION_AMOUNT + 1,
                    delegator: usize::arbitrary(g) % delegators.len(),
                }
            }),
        },
        OperationWeight {
            weight:    50,
            operation: Box::new(|g, operations, _publishers, delegators| {
                let cgp_ops: Vec<&Operation> = operations
                    .iter()
                    .filter(|op| matches!(op, Operation::CreateGovernancePosition { .. }))
                    .collect();
                let del_op = g.choose(&cgp_ops);
                if let Some(Operation::CreateGovernancePosition { delegator, amount }) = del_op {
                    Operation::CloseGovernancePosition {
                        delegator: *delegator,
                        amount:    min(u64::arbitrary(g) % MAX_UNDELEGATION_AMOUNT + 1, *amount),
                    }
                } else {
                    Operation::CloseGovernancePosition {
                        delegator: usize::arbitrary(g) % delegators.len(),
                        amount:    u64::arbitrary(g) % MAX_UNDELEGATION_AMOUNT + 1,
                    }
                }
            }),
        },
    ];

    let total_weight: u64 = operations.iter().map(|op| op.weight).sum();
    let rnd = u64::arbitrary(g) % total_weight;
    let mut cumulative_weight = 0;

    for op_weight in operations {
        cumulative_weight += op_weight.weight;
        if rnd < cumulative_weight {
            return (op_weight.operation)(g, prev_operations, publishers, delegators);
        }
    }

    unreachable!()
}

fn sanity_check_publisher(
    svm: &mut LiteSVM,
    pool_data_pubkey: Pubkey,
    stake_accounts: &[Pubkey],
    index: usize,
) {
    let pool_data: PoolData = fetch_account_data_bytemuck(svm, &pool_data_pubkey);
    let publisher = pool_data.publishers[index];
    let mut total_delegated = 0;
    let mut delta: i64 = 0;

    for stake_account in stake_accounts.iter() {
        let mut stake_positions_account = fetch_positions_account(svm, stake_account);
        let positions = stake_positions_account.to_dynamic_position_array();

        for i in 0..positions.get_position_capacity() {
            if let Some(position) = positions.read_position(i).unwrap() {
                let position_state = position
                    .get_current_position(get_current_epoch(svm), UNLOCKING_DURATION)
                    .unwrap();
                if matches!(position, Position {
                        target_with_parameters: TargetWithParameters::IntegrityPool { publisher: p, .. },
                        ..
                    } if p == publisher
                ) {
                    if position_state == PositionState::LOCKED
                        || position_state == PositionState::PREUNLOCKING
                    {
                        total_delegated += position.amount;
                    }
                    if position_state == PositionState::LOCKING {
                        delta += position.amount as i64;
                    }
                    if position_state == PositionState::PREUNLOCKING {
                        delta -= position.amount as i64;
                    }
                }
            }
        }
    }

    assert!(delta == pool_data.del_state[index].delta_delegation);
    assert!(total_delegated == pool_data.del_state[index].total_delegation);
}

fn sanity_check(svm: &mut LiteSVM, pool_data_pubkey: Pubkey, stake_accounts: &[Pubkey]) {
    for i in 0..MAX_PUBLISHERS {
        sanity_check_publisher(svm, pool_data_pubkey, stake_accounts, i);
    }
}

fn handle_delegate_operation(
    svm: &mut LiteSVM,
    pool_data_pubkey: Pubkey,
    delegator: &Keypair,
    publisher: Pubkey,
    amount: u64,
    stake_account_positions: Pubkey,
) -> bool {
    let stake_account_custody = get_stake_account_custody_address(stake_account_positions);

    let custody_data: TokenAccount = fetch_account_data(svm, &stake_account_custody);

    let mut stake_positions_account = fetch_positions_account(svm, &stake_account_positions);
    let positions = stake_positions_account.to_dynamic_position_array();

    let mut total_delegated = 0;

    for i in 0..positions.get_position_capacity() {
        if let Some(position) = positions.read_position(i).unwrap() {
            if position.target_with_parameters.get_target() == Target::IntegrityPool {
                total_delegated += position.amount;
            }
        }
    }

    let res = delegate(
        svm,
        delegator,
        publisher,
        pool_data_pubkey,
        stake_account_positions,
        amount,
    );

    if total_delegated + amount > custody_data.amount {
        assert_anchor_program_error!(res, StakingErrorCode::TooMuchExposureToIntegrityPool, 0);
        false
    } else {
        res.unwrap();
        true
    }
}

fn test_stability(props: StabilityTestProps) {
    let SetupResult {
        mut svm,
        payer,
        pyth_token_mint,
        publisher_keypair: _,
        pool_data_pubkey,
        reward_program_authority,
        maybe_publisher_index: _,
    } = setup(SetupProps {
        init_config:     true,
        init_target:     true,
        init_mint:       true,
        init_pool_data:  true,
        init_publishers: false,
    });

    props.delegators.iter().for_each(|delegator| {
        svm.airdrop(&delegator.0.pubkey(), 1_000_000_000).unwrap();
    });

    let stake_account_positions: Vec<Pubkey> = props
        .delegators
        .iter()
        .enumerate()
        .map(|(i, delegator)| {
            if i % 100 == 0 {
                println!(
                    "creating stake account {} out of {}",
                    i,
                    props.delegators.len()
                );
            }
            initialize_new_stake_account(&mut svm, &delegator.0, &pyth_token_mint, true, true)
        })
        .collect();

    initialize_pool_reward_custody(&mut svm, &payer, &pyth_token_mint);

    update_y(&mut svm, &payer, &reward_program_authority, Y).unwrap();

    let publisher_caps = post_publisher_caps(
        &mut svm,
        &payer,
        props.publishers.iter().map(|p| p.0.pubkey()).collect(),
        vec![0; props.publishers.len()],
    );
    advance(&mut svm, &payer, publisher_caps).unwrap();

    let mut operation_counts: HashMap<String, (u64, u64)> = HashMap::new();

    for (i, operation) in props.operations.iter().enumerate() {
        operation_counts
            .entry(operation.get_name())
            .or_insert((0, 0))
            .1 += 1;

        if i % 100 == 0 {
            println!("operation {} out of {}", i, props.operations.len());
        }

        if i % 100 == 0 {
            sanity_check(&mut svm, pool_data_pubkey, &stake_account_positions);
        }

        svm.expire_blockhash();
        match operation {
            Operation::Delegate {
                publisher,
                delegator,
                amount,
            } => {
                let publisher_pubkey = props.publishers[*publisher].0.pubkey();
                let success = handle_delegate_operation(
                    &mut svm,
                    pool_data_pubkey,
                    &props.delegators[*delegator].0,
                    publisher_pubkey,
                    *amount,
                    stake_account_positions[*delegator],
                );

                let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
                let p_index = pool_data.get_publisher_index(&publisher_pubkey).unwrap();
                sanity_check_publisher(
                    &mut svm,
                    pool_data_pubkey,
                    &stake_account_positions,
                    p_index,
                );

                operation_counts.get_mut(&operation.get_name()).unwrap().0 += success as u64;
            }
            Operation::Undelegate {
                publisher,
                delegator,
                amount,
            } => {
                let publisher_pubkey = props.publishers[*publisher].0.pubkey();
                let mut stake_positions_account =
                    fetch_positions_account(&mut svm, &stake_account_positions[*delegator]);
                let positions = stake_positions_account.to_dynamic_position_array();

                let mut index: u8 = 0;
                let mut position_value = 0;
                for i in 0..positions.get_position_capacity() {
                    if let Some(position) = positions.read_position(i).unwrap() {
                        let position_state = position
                            .get_current_position(get_current_epoch(&mut svm), UNLOCKING_DURATION)
                            .unwrap();
                        if matches!(position, Position {
                                target_with_parameters: TargetWithParameters::IntegrityPool { publisher: p, .. },
                                ..
                            } if p == props.publishers[*publisher].0.pubkey()
                        ) && (position_state == PositionState::LOCKED
                            || position_state == PositionState::LOCKING)
                        {
                            index = i.try_into().unwrap();
                            position_value = position.amount;
                            break;
                        }
                    }
                }

                advance_delegation_record(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    props.publishers[*publisher].0.pubkey(),
                    stake_account_positions[*delegator],
                    pyth_token_mint.pubkey(),
                    pool_data_pubkey,
                    None,
                )
                .unwrap();

                if position_value == 0 {
                    continue;
                }

                undelegate(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    props.publishers[*publisher].0.pubkey(),
                    pool_data_pubkey,
                    stake_account_positions[*delegator],
                    index,
                    min(*amount, position_value),
                )
                .unwrap();

                let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
                let p_index = pool_data.get_publisher_index(&publisher_pubkey).unwrap();
                sanity_check_publisher(
                    &mut svm,
                    pool_data_pubkey,
                    &stake_account_positions,
                    p_index,
                );

                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
            Operation::AdvanceDelegationRecord {
                publisher,
                delegator,
            } => {
                advance_delegation_record(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    props.publishers[*publisher].0.pubkey(),
                    stake_account_positions[*delegator],
                    pyth_token_mint.pubkey(),
                    pool_data_pubkey,
                    None,
                )
                .unwrap();
                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
            Operation::Advance { cap } => {
                advance_n_epochs(&mut svm, &payer, 1);
                let publisher_caps = post_publisher_caps(
                    &mut svm,
                    &payer,
                    props.publishers.iter().map(|p| p.0.pubkey()).collect(),
                    vec![*cap; props.publishers.len()],
                );
                advance(&mut svm, &payer, publisher_caps).unwrap();
                sanity_check(&mut svm, pool_data_pubkey, &stake_account_positions);
                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
            Operation::Slash { publisher, amount } => {
                let publisher_pubkey = props.publishers[*publisher].0.pubkey();
                let slash_custody =
                    create_token_account(&mut svm, &payer, &pyth_token_mint.pubkey());
                let pool_data: PoolData = fetch_account_data_bytemuck(&mut svm, &pool_data_pubkey);
                let p_index = pool_data.get_publisher_index(&publisher_pubkey).unwrap();
                let index = pool_data.num_slash_events[p_index];

                create_slash_event(
                    &mut svm,
                    &payer,
                    &reward_program_authority,
                    index,
                    *amount,
                    slash_custody.pubkey(),
                    publisher_pubkey,
                    pool_data_pubkey,
                )
                .unwrap();

                for (i, delegator) in props.delegators.iter().enumerate() {
                    let positions_pubkey = &stake_account_positions[i];

                    advance_delegation_record(
                        &mut svm,
                        &delegator.0,
                        publisher_pubkey,
                        *positions_pubkey,
                        pyth_token_mint.pubkey(),
                        pool_data_pubkey,
                        None,
                    )
                    .unwrap();

                    slash(
                        &mut svm,
                        &payer,
                        *positions_pubkey,
                        index,
                        slash_custody.pubkey(),
                        publisher_pubkey,
                        pool_data_pubkey,
                    )
                    .unwrap();
                }
                sanity_check(&mut svm, pool_data_pubkey, &stake_account_positions);
                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
            Operation::MergePositions {
                publisher,
                delegator,
            } => {
                advance_delegation_record(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    props.publishers[*publisher].0.pubkey(),
                    stake_account_positions[*delegator],
                    pyth_token_mint.pubkey(),
                    pool_data_pubkey,
                    None,
                )
                .unwrap();
                merge_delegation_positions(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    props.publishers[*publisher].0.pubkey(),
                    pool_data_pubkey,
                    stake_account_positions[*delegator],
                )
                .unwrap();
                sanity_check(&mut svm, pool_data_pubkey, &stake_account_positions);
                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
            Operation::CreateGovernancePosition { amount, delegator } => {
                create_position(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    stake_account_positions[*delegator],
                    TargetWithParameters::Voting {},
                    None,
                    *amount,
                );
                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
            Operation::CloseGovernancePosition { delegator, amount } => {
                let mut stake_positions_account =
                    fetch_positions_account(&mut svm, &stake_account_positions[*delegator]);
                let positions = stake_positions_account.to_dynamic_position_array();

                let mut index: u8 = 0;
                let mut position_value = 0;
                for i in 0..positions.get_position_capacity() {
                    if let Some(position) = positions.read_position(i).unwrap() {
                        let position_state = position
                            .get_current_position(get_current_epoch(&mut svm), UNLOCKING_DURATION)
                            .unwrap();
                        if matches!(
                            position,
                            Position {
                                target_with_parameters: TargetWithParameters::Voting { .. },
                                ..
                            }
                        ) && (position_state == PositionState::LOCKED
                            || position_state == PositionState::LOCKING)
                        {
                            index = i.try_into().unwrap();
                            position_value = position.amount;
                            break;
                        }
                    }
                }

                if position_value == 0 {
                    continue;
                }

                close_position(
                    &mut svm,
                    &props.delegators[*delegator].0,
                    stake_account_positions[*delegator],
                    TargetWithParameters::Voting {},
                    None,
                    min(*amount, position_value),
                    index,
                )
                .unwrap();

                operation_counts.get_mut(&operation.get_name()).unwrap().0 += 1;
            }
        }
    }

    println!("Operation counts:");
    for (name, (count, total)) in operation_counts.iter() {
        println!("{}: {}/{}", name, count, total);
    }
}


/// This stability test runs a large number of random operations on the integrity pool program.
/// It takes more than 5 minutes to run and is disabled by default.
#[test]
#[ignore]
fn quickcheck_stability() {
    QuickCheck::new()
        .tests(1)
        .quickcheck(test_stability as fn(StabilityTestProps))
}
