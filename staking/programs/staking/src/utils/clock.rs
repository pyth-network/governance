use anchor_lang::{prelude::*, solana_program::clock::UnixTimestamp};

/// Computes Pyth clock.
/// Right now it's just the current Unix timestamp divided by the epoch length
pub fn get_current_epoch(epoch_duration : u64) -> Result<u64>{
    let now_ts = Clock::get().unwrap().unix_timestamp as u64;
    Ok(now_ts.checked_div(epoch_duration).unwrap())
}

pub fn get_current_time() -> UnixTimestamp {
    Clock::get().unwrap().unix_timestamp
} 