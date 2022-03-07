use anchor_lang::{prelude::*, solana_program::clock::UnixTimestamp};
use crate::{error::ErrorCode, state::global_config::{GlobalConfig}};

/// Computes Pyth clock.
/// Right now it's just the current Unix timestamp divided by the epoch length
pub fn get_current_epoch(global_config : &GlobalConfig) -> Result<u64>{
    let now_ts : u64 = get_current_time(global_config) as u64;
    return now_ts.checked_div(global_config.epoch_duration).ok_or(error!(ErrorCode::ZeroEpochDuration));
}

#[cfg(feature = "mock-clock")]
pub fn get_current_time(global_config : &GlobalConfig) -> UnixTimestamp {
    global_config.mock_clock_time
}
#[cfg(not(feature = "mock-clock"))]
    pub fn get_current_time(global_config : &GlobalConfig) -> UnixTimestamp {
    Clock::get().unwrap().unix_timestamp
} 