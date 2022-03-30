use anchor_lang::prelude::*;
use crate::state::{
    global_config::GlobalConfig,
    positions::{Position, PositionData, PositionState, MAX_POSITIONS}
};
use crate::utils::clock::get_current_epoch;


pub fn compute_voter_weight(stake_account_positions: &PositionData, current_epoch: u64, unlocking_duration: u8) -> Result<u64> {
    let mut voter_weight = 0u64;
    for i in 0..MAX_POSITIONS {
        if stake_account_positions.positions[i].is_some() {
            let position = stake_account_positions.positions[i].unwrap();
            match position.get_current_position(current_epoch, unlocking_duration)? {
                PositionState::LOCKED => {
                    if position.is_voting() {
                        // position.amount is trusted, so I don't think this can overflow,
                        // but still probably better to use checked math
                        voter_weight = voter_weight.checked_add(position.amount).unwrap();
                    }
                }
                _ => {}
            }
        }
    }
    Ok(voter_weight)
}