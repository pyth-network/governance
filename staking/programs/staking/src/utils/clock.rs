use anchor_lang::prelude::*;

pub fn get_current_epoch(epoch_duration : u64) -> Result<u64, ProgramError>{
    let now_ts = Clock::get().unwrap().unix_timestamp as u64;
    Ok(now_ts.checked_div(epoch_duration).unwrap())
}