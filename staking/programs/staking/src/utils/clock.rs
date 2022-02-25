use anchor_lang::{prelude::*, solana_program::clock::UnixTimestamp};
use crate::error::ErrorCode;

/// Computes Pyth clock.
/// Right now it's just the current Unix timestamp divided by the epoch length
pub fn get_current_epoch(epoch_duration : u64) -> Result<u64>{
    let now_ts = Clock::get()?.unix_timestamp as u64;
    return now_ts.checked_div(epoch_duration).ok_or(error!(ErrorCode::ZeroEpochDuration));
}

pub fn get_current_time() -> UnixTimestamp {
    Clock::get().unwrap().unix_timestamp
} 