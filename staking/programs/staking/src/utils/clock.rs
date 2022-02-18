use anchor_lang::prelude::*;

pub type EpochNum = u64;
/// Computes Pyth clock.
/// Right now it's just the current Unix timestamp divided by the epoch length
pub fn get_current_epoch(epoch_duration : u64) -> Result<EpochNum, ProgramError>{
    let now_ts = Clock::get().unwrap().unix_timestamp as EpochNum;
    Ok(now_ts.checked_div(epoch_duration).unwrap())
}