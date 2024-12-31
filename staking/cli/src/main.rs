pub mod cli;
pub mod instructions;

use {
    clap::Parser,
    cli::{
        Action,
        Cli,
    },
    instructions::claim_rewards,
    solana_client::nonblocking::rpc_client::RpcClient,
    solana_sdk::commitment_config::CommitmentConfig,
};

#[tokio::main]
async fn main() {
    let Cli {
        keypair,
        rpc_url,
        action,
    } = Cli::parse();
    let rpc_client = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

    match action {
        Action::ClaimRewards {
            min_staked,
            min_reward,
        } => claim_rewards(&rpc_client, keypair.as_ref(), min_staked, min_reward).await,
    }
}
