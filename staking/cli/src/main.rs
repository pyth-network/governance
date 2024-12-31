pub mod cli;
pub mod instructions;

use {
    clap::Parser,
    cli::{
        Action,
        Cli,
    },
    instructions::{
        close_all_publisher_caps,
        close_publisher_caps,
        create_slash_event,
        fetch_publisher_caps_and_advance,
        initialize_pool,
        initialize_reward_custody,
        save_stake_accounts_snapshot,
        set_publisher_stake_account,
        slash,
        update_delegation_fee,
        update_reward_program_authority,
        update_y,
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
                keypair.as_ref(),
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
            fetch_publisher_caps_and_advance(&rpc_client, keypair.as_ref(), wormhole, hermes_url);
        }
        Action::InitializePoolRewardCustody {} => {
            initialize_reward_custody(&rpc_client, keypair.as_ref());
        }
        Action::UpdateDelegationFee { delegation_fee } => {
            update_delegation_fee(&rpc_client, keypair.as_ref(), delegation_fee)
        }
        Action::SetPublisherStakeAccount {
            publisher,
            stake_account_positions,
        } => set_publisher_stake_account(
            &rpc_client,
            keypair.as_ref(),
            &publisher,
            &stake_account_positions,
        ),
        Action::CreateSlashEvent {
            publisher,
            slash_ratio,
        } => create_slash_event(&rpc_client, keypair.as_ref(), &publisher, slash_ratio),
        Action::UpdateRewardProgramAuthority {
            new_reward_program_authority,
        } => update_reward_program_authority(
            &rpc_client,
            keypair.as_ref(),
            &new_reward_program_authority,
        ),
        Action::Slash {
            publisher,
            stake_account_positions,
        } => slash(
            &rpc_client,
            keypair.as_ref(),
            &publisher,
            &stake_account_positions,
        ),
        Action::UpdateY { y } => update_y(&rpc_client, keypair.as_ref(), y),
        Action::ClosePublisherCaps { publisher_caps } => {
            close_publisher_caps(&rpc_client, keypair.as_ref(), publisher_caps)
        }
        Action::SaveStakeAccountsSnapshot {} => {
            save_stake_accounts_snapshot(&rpc_client);
        }
        Action::CloseAllPublisherCaps {} => {
            close_all_publisher_caps(&rpc_client, keypair.as_ref());
        }
    }
}
