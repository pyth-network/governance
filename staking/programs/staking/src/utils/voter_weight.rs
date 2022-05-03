use crate::error::ErrorCode;
use crate::state::positions::{
    PositionData,
    PositionState,
    MAX_POSITIONS,
};
use anchor_lang::prelude::*;
use std::convert::TryInto;

pub fn compute_voter_weight(
    stake_account_positions: &PositionData,
    current_epoch: u64,
    unlocking_duration: u8,
    current_locked: u64,
    total_supply: u64,
) -> Result<u64> {
    let mut raw_voter_weight = 0u64;
    for i in 0..MAX_POSITIONS {
        if let Some(position) = stake_account_positions.positions[i] {
            match position.get_current_position(current_epoch, unlocking_duration)? {
                PositionState::LOCKED | PositionState::PREUNLOCKING => {
                    if position.is_voting() {
                        // position.amount is trusted, so I don't think this can overflow,
                        // but still probably better to use checked math
                        raw_voter_weight = raw_voter_weight.checked_add(position.amount).unwrap();
                    }
                }
                _ => {}
            }
        }
    }
    let voter_weight: u64 = ((raw_voter_weight as u128) * (total_supply as u128))
        .checked_div(current_locked as u128)
        .unwrap_or(0_u128)
        .try_into()
        .map_err(|_| ErrorCode::GenericOverflow)?;
    Ok(voter_weight)
}
