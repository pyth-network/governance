//! CLI options
use {
    clap::{
        Parser,
        Subcommand,
    },
    solana_sdk::{
        pubkey::Pubkey,
        signature::{
            read_keypair_file,
            Keypair,
        },
    },
};

#[derive(Parser, Debug)]
#[clap(
    about = "A cli for the staking program",
    author = "Pyth Network Contributors"
)]
pub struct Cli {
    #[clap(long, default_value = "https://api.devnet.solana.com/")]
    pub rpc_url: String,
    #[clap(
        long,
        default_value = "~/.config/solana/id.json",
        help = "Keypair file the funder of the transaction",
        parse(try_from_str = get_keypair_from_file)
    )]
    pub keypair: Keypair,
    #[clap(subcommand)]
    pub action:  Action,
}

fn get_keypair_from_file(path: &str) -> Result<Keypair, String> {
    read_keypair_file(&*shellexpand::tilde(&path))
        .map_err(|_| format!("Keypair not found: {}", path))
}

#[allow(clippy::large_enum_variant)]
#[derive(Subcommand, Debug)]
pub enum Action {
    #[clap(about = "Initialize pool")]
    InitializePool {
        #[clap(
            long,
            help = "Keypair pool data account",
            parse(try_from_str = get_keypair_from_file)
        )]
        pool_data_keypair:        Keypair,
        #[clap(long, help = "Y parameter")]
        y:                        u64,
        #[clap(long, help = "Reward program authority parameter")]
        reward_program_authority: Pubkey,
        #[clap(long, help = "Slash custody parameter")]
        slash_custody:            Pubkey,
    },
    Advance {
        #[clap(long, help = "Url to the hermes to fetch publisher caps")]
        hermes_url: String,

        #[clap(long, default_value = "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5")]
        wormhole: Pubkey,
    },
    InitializePoolRewardCustody {},
}
