//! CLI options
use {
    clap::{
        Parser,
        Subcommand,
    },
    solana_remote_wallet::{
        locator::Locator,
        remote_keypair::generate_remote_keypair,
        remote_wallet::maybe_wallet_manager,
    },
    solana_sdk::{
        derivation_path::DerivationPath,
        pubkey::Pubkey,
        signature::{
            read_keypair_file,
            Keypair,
        },
        signer::Signer,
    },
    std::convert::TryFrom,
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
        parse(try_from_str = get_signer_from_path)
    )]
    pub keypair: Box<dyn Signer>,
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
        #[clap(
            long,
            help = "Url of hermes to fetch publisher caps",
            default_value = "https://hermes-beta.pyth.network/"
        )]
        hermes_url: String,

        #[clap(long, default_value = "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5")]
        wormhole: Pubkey,
    },
    InitializePoolRewardCustody {},
    UpdateDelegationFee {
        #[clap(long, help = "New fee")]
        delegation_fee: u64,
    },
    SetPublisherStakeAccount {
        #[clap(long, help = "Publisher")]
        publisher:               Pubkey,
        #[clap(long, help = "Stake account positions")]
        stake_account_positions: Pubkey,
    },
    CreateSlashEvent {
        #[clap(long, help = "Publisher")]
        publisher:   Pubkey,
        #[clap(long, help = "Amount")]
        slash_ratio: u64,
    },
    UpdateRewardProgramAuthority {
        #[clap(long, help = "New reward program authority")]
        new_reward_program_authority: Pubkey,
    },
    Slash {
        #[clap(long, help = "Publisher")]
        publisher:               Pubkey,
        #[clap(long, help = "Stake account positions")]
        stake_account_positions: Pubkey,
    },
    UpdateY {
        #[clap(long, help = "New Y")]
        y: u64,
    },
    ClosePublisherCaps {
        #[clap(long, help = "Publisher caps")]
        publisher_caps: Pubkey,
    },
    SaveStakeAccountsSnapshot {},
}

pub enum SignerSource {
    Filepath(String),
    Usb {
        locator:         Locator,
        derivation_path: Option<DerivationPath>,
    },
}

pub fn get_signer_source_from_path(source: &str) -> Result<SignerSource, String> {
    match uriparse::URIReference::try_from(source) {
        Ok(uri) => {
            if let Some(scheme) = uri.scheme() {
                match scheme.as_str() {
                    "usb" => Ok(SignerSource::Usb {
                        locator:         Locator::new_from_uri(&uri).unwrap(),
                        derivation_path: DerivationPath::from_uri_any_query(&uri).unwrap(),
                    }),
                    _ => Err(format!("Unsupported scheme: {}", scheme)),
                }
            } else {
                Ok(std::fs::metadata(shellexpand::tilde(source).to_string())
                    .map(|_| SignerSource::Filepath(source.to_string()))
                    .map_err(|_| format!("Invalid keypair path: {}", source))
                    .unwrap())
            }
        }
        Err(e) => Err(format!("Invalid keypair source: {}", e)),
    }
}

/// This is mostly borrowed from https://github.com/solana-labs/solana/blob/master/clap-utils/src/keypair.rs#L753
/// To use ledger use `usb://ledger` or `usb://ledger?key=0/0`.
pub fn get_signer_from_path(source: &str) -> Result<Box<dyn Signer>, String> {
    let signer_source = get_signer_source_from_path(source)?;
    match signer_source {
        SignerSource::Filepath(path) => Ok(get_keypair_from_file(&path)?.into()),
        SignerSource::Usb {
            locator,
            derivation_path,
        } => Ok(Box::new(
            generate_remote_keypair(
                locator,
                derivation_path.unwrap_or_default(),
                &maybe_wallet_manager().unwrap().unwrap(),
                false,
                "",
            )
            .unwrap(),
        )),
    }
}
