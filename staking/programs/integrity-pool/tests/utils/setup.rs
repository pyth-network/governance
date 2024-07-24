use {
    super::{
        clock::advance_n_epochs,
        integrity_pool::{
            advance::advance,
            pool_data::create_pool_data_account,
            reward_program::initialize_pool_reward_custody,
        },
        mint::init_mint_account,
        publisher_caps::post_publisher_caps::post_publisher_caps,
        staking::{
            create_target::create_target_account,
            init_config::init_config_account,
        },
    },
    solana_sdk::{
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
    },
};


pub struct SetupResult {
    pub svm:                      litesvm::LiteSVM,
    pub payer:                    Keypair,
    pub pyth_token_mint:          Keypair,
    pub publisher_keypair:        Keypair,
    pub pool_data_pubkey:         Pubkey,
    pub reward_program_authority: Keypair,
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
        "../../../staking/target/deploy/integrity_pool.so",
    )
    .unwrap();
    svm.add_program_from_file(staking::ID, "../../../staking/target/deploy/staking.so")
        .unwrap();
    svm.add_program_from_file(
        publisher_caps::ID,
        "../../../staking/target/deploy/publisher_caps.so",
    )
    .unwrap();

    svm.airdrop(&payer.pubkey(), 100_000_000_000).unwrap();

    if init_config {
        init_config_account(&mut svm, &payer, pyth_token_mint.pubkey());
    }

    advance_n_epochs(&mut svm, &payer, 1);

    if init_target {
        create_target_account(&mut svm, &payer)
    }

    if init_mint {
        init_mint_account(&mut svm, &payer, &pyth_token_mint)
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
        initialize_pool_reward_custody(&mut svm, &payer, pyth_token_mint.pubkey()).unwrap();
        let publisher_caps = post_publisher_caps(&mut svm, &payer, publisher_keypair.pubkey(), 100);
        advance(&mut svm, &payer, publisher_caps, pyth_token_mint.pubkey()).unwrap();
    }

    SetupResult {
        svm,
        payer,
        pyth_token_mint,
        publisher_keypair,
        pool_data_pubkey: pool_data_keypair.pubkey(),
        reward_program_authority,
    }
}
