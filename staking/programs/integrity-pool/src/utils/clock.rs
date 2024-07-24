use {
    anchor_lang::{
        prelude::*,
        solana_program::clock::UnixTimestamp,
    },
    std::convert::TryInto,
};

pub const EPOCH_DURATION: u64 = 60 * 60 * 24 * 7; // 1 week
pub const UNLOCKING_DURATION: u8 = 1; // 1 epoch

/// Computes Pyth clock.
/// Right now it's just the current Unix timestamp divided by the epoch duration.
pub fn get_current_epoch() -> Result<u64> {
    let now_ts = get_current_time();
    time_to_epoch(now_ts)
}

pub fn time_to_epoch(now_ts: UnixTimestamp) -> Result<u64> {
    // divide now_ts by EPOCH_DURATION
    Ok(TryInto::<u64>::try_into(now_ts)? / EPOCH_DURATION)
}

pub fn get_current_time() -> UnixTimestamp {
    Clock::get().unwrap().unix_timestamp
}
