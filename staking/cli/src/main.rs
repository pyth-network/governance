pub mod cli;
pub mod instructions;

use {
    clap::Parser,
    cli::{
        Action,
        Cli,
    },
    instructions::{
        fetch_publisher_caps_and_advance,
        initialize_pool,
        initialize_reward_custody,
    },
    solana_client::rpc_client::RpcClient,
    solana_sdk::commitment_config::CommitmentConfig,
};


fn main() {
    let Cli {
        keypair,
        rpc_url,
        action,
    } = Cli::parse();
    let rpc_client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

    match action {
        Action::InitializePool {
            pool_data_keypair,
            reward_program_authority,
            y,
            slash_custody,
        } => {
            initialize_pool(
                &rpc_client,
                &keypair,
                &pool_data_keypair,
                reward_program_authority,
                y,
                slash_custody,
            );
        }
        Action::Advance {
            hermes_url,
            wormhole,
        } => {
            fetch_publisher_caps_and_advance(&rpc_client, &keypair, wormhole, hermes_url);
        }
        Action::InitializePoolRewardCustody {} => {
            initialize_reward_custody(&rpc_client, &keypair);
        }
    }
}
