pub mod cli;
pub mod instructions;

use {
    clap::Parser,
    cli::{
        Action,
        Cli,
    },
    instructions::{
        create_slash_event,
        fetch_publisher_caps_and_advance,
        initialize_pool,
        initialize_reward_custody,
        set_publisher_stake_account,
        update_delegation_fee,
        update_reward_program_authority,
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
        Action::UpdateDelegationFee { delegation_fee } => {
            update_delegation_fee(&rpc_client, &keypair, delegation_fee)
        }
        Action::SetPublisherStakeAccount {
            publisher,
            stake_account_positions,
        } => {
            set_publisher_stake_account(&rpc_client, &keypair, &publisher, &stake_account_positions)
        }
        Action::CreateSlashEvent {
            publisher,
            slash_ratio,
        } => create_slash_event(&rpc_client, &keypair, &publisher, slash_ratio),
        Action::UpdateRewardProgramAuthority {
            new_reward_program_authority,
        } => update_reward_program_authority(&rpc_client, &keypair, &new_reward_program_authority),
    }
}
