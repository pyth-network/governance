use {
    crate::{
        integrity_pool::{
            helper_functions::initialize_pool_reward_custody,
            instructions::{
                advance,
                create_pool_data_account,
            },
        },
        publisher_caps::helper_functions::post_publisher_caps,
        solana::{
            instructions::init_mint_account,
            utils::fetch_account_data_bytemuck,
        },
        staking::instructions::{
            create_target_account,
            init_config_account,
            update_max_voter_weight_record,
        },
        utils::clock::advance_n_epochs,
    },
    integrity_pool::state::pool::PoolData,
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
};

pub const STARTING_EPOCH: u64 = 2;

pub struct SetupResult {
    pub svm:                      litesvm::LiteSVM,
    pub payer:                    Keypair,
    pub pyth_token_mint:          Keypair,
    pub publisher_keypair:        Keypair,
    pub pool_data_pubkey:         Pubkey,
    pub reward_program_authority: Keypair,
    pub publisher_index:          usize,
}

pub struct SetupProps {
    pub init_config:     bool,
    pub init_target:     bool,
    pub init_mint:       bool,
    pub init_pool_data:  bool,
    pub init_publishers: bool,
}

pub fn setup(props: SetupProps) -> SetupResult {
    let SetupProps {
        init_config,
        init_target,
        init_mint,
        init_pool_data,
        init_publishers,
    } = props;

    let pyth_token_mint = Keypair::new();
    let mut svm = litesvm::LiteSVM::new();
    let payer = Keypair::new();
    let publisher_keypair = Keypair::new();
    let pool_data_keypair = Keypair::new();
    let reward_program_authority = Keypair::new();

    svm.add_program_from_file(
        integrity_pool::ID,
        "../../staking/target/deploy/integrity_pool.so",
    )
    .unwrap();
    svm.add_program_from_file(staking::ID, "../../staking/target/deploy/staking.so")
        .unwrap();
    svm.add_program_from_file(
        publisher_caps::ID,
        "../../staking/target/deploy/publisher_caps.so",
    )
    .unwrap();

    svm.airdrop(&payer.pubkey(), 100_000_000_000).unwrap();

    if init_config {
        init_config_account(&mut svm, &payer, pyth_token_mint.pubkey(), None, None);
        update_max_voter_weight_record(&mut svm, &payer);
    }

    advance_n_epochs(&mut svm, &payer, 1);

    if init_target {
        create_target_account(&mut svm, &payer);
    }

    if init_mint {
        init_mint_account(&mut svm, &payer, &pyth_token_mint);
    }

    if init_pool_data {
        create_pool_data_account(
            &mut svm,
            &payer,
            &pool_data_keypair,
            reward_program_authority.pubkey(),
            pyth_token_mint.pubkey(),
        )
        .unwrap();
    }

    advance_n_epochs(&mut svm, &payer, 1);
    if init_publishers {
        initialize_pool_reward_custody(&mut svm, &payer, pyth_token_mint.pubkey());
        let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 100);
        advance(&mut svm, &payer, publisher_caps).unwrap();
    }

    let pool_data = fetch_account_data_bytemuck::<PoolData>(&mut svm, &pool_data_keypair.pubkey());

    let publisher_index = pool_data
        .publishers
        .iter()
        .position(|&x| x == publisher_keypair.pubkey())
        .unwrap();

    SetupResult {
        svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey: pool_data_keypair.pubkey(),
        reward_program_authority,
        publisher_index,
    }
}
