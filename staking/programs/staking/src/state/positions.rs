use crate::borsh::BorshSerialize;
use crate::error::ErrorCode;
use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::wasm_bindgen;
use std::fmt::{
    self,
    Debug,
};

pub const MAX_POSITIONS: usize = 100;
pub const POSITION_DATA_PADDING: [u64; 12] = [0u64; 12];

/// An array that contains all of a user's positions i.e. where are the staking and who are they
/// staking to We mostly fill it front to back, but indicies don't mean much.
/// Because users can close positions, it might get fragmented.
#[account(zero_copy)]
#[derive(BorshSchema, BorshSerialize)]
pub struct PositionData {
    pub owner:     Pubkey,
    pub positions: [Option<Position>; MAX_POSITIONS],
}

impl PositionData {
    /// Finds first index available for a new position
    pub fn get_unused_index(&self) -> Result<usize> {
        for i in 0..MAX_POSITIONS {
            match self.positions[i] {
                None => return Ok(i),
                _ => {}
            }
        }
        return Err(error!(ErrorCode::TooManyPositions));
    }
}

/// This represents a staking position, i.e. an amount that someone has staked to a particular
/// target. This is one of the core pieces of our staking design, and stores all
/// of the state related to a position The voting position is a position where the
/// target_with_parameters is VOTING
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema)]
#[repr(C)]
pub struct Position {
    pub amount:                 u64,
    pub activation_epoch:       u64,
    pub unlocking_start:        Option<u64>,
    pub target_with_parameters: TargetWithParameters,
    pub reserved:               [u64; 12], /* Current representation of an Option<Position>:
                                              0: amount
                                              8: activation_epoch
                                              16: 1 if unlocking_start is Some, 2 if the outer option is None
                                              24: unlocking_start
                                              32: product
                                              64: 2 if VOTING, 0 if STAKING DEFAULT, 1 if STAKING SOME
                                              65: publisher address
                                              98: compiler padding
                                              104: reserved

                                              total: 200 bytes
                                           */
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Debug,
    Clone,
    Copy,
    BorshSchema,
    PartialOrd,
    Ord,
    PartialEq,
    Eq,
)]
pub enum Target {
    VOTING,
    STAKING { product: Pubkey },
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq)]
pub enum TargetWithParameters {
    VOTING,
    STAKING {
        product:   Pubkey,
        publisher: Publisher,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq)]
pub enum Publisher {
    DEFAULT,
    SOME { address: Pubkey },
}

impl TargetWithParameters {
    pub fn get_target(&self) -> Target {
        match *self {
            TargetWithParameters::VOTING => Target::VOTING,
            TargetWithParameters::STAKING {
                product,
                publisher: _,
            } => Target::STAKING { product },
        }
    }
}

impl Position {
    /// Managing the state of a position is tricky because we can only update the data when a user
    /// makes a transaction but many of the state transitions take effect later, e.g. at the
    /// next epoch boundary. In order to get the actual current state, we need the current
    /// epoch. This encapsulates that logic so that other parts of the code can use the actual
    /// state.
    pub fn get_current_position(
        &self,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> Result<PositionState> {
        if current_epoch < self.activation_epoch {
            Ok(PositionState::LOCKING)
        } else {
            match self.unlocking_start {
                None => Ok(PositionState::LOCKED),
                Some(unlocking_start) => {
                    if (self.activation_epoch <= current_epoch) && (current_epoch < unlocking_start)
                    {
                        Ok(PositionState::PREUNLOCKING)
                    } else if (unlocking_start <= current_epoch)
                        && (current_epoch < unlocking_start + unlocking_duration as u64)
                    {
                        Ok(PositionState::UNLOCKING)
                    } else {
                        Ok(PositionState::UNLOCKED)
                    }
                }
            }
        }
    }

    pub fn is_voting(&self) -> bool {
        return matches!(self.target_with_parameters, TargetWithParameters::VOTING);
    }
}

/// The core states that a position can be in
#[repr(u8)]
#[wasm_bindgen]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq)]
pub enum PositionState {
    UNLOCKED,
    LOCKING,
    LOCKED,
    PREUNLOCKING,
    UNLOCKING,
}

impl std::fmt::Display for PositionState {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[cfg(test)]
pub mod tests {
    use crate::state::positions::{
        Position,
        PositionData,
        PositionState,
        TargetWithParameters,
        POSITION_DATA_PADDING,
    };
    #[test]
    fn lifecycle_lock_unlock() {
        let p = Position {
            activation_epoch:       8,
            unlocking_start:        Some(12),
            target_with_parameters: TargetWithParameters::VOTING,
            amount:                 10,
            reserved:               POSITION_DATA_PADDING,
        };
        assert_eq!(
            PositionState::LOCKING,
            p.get_current_position(0, 2).unwrap()
        );
        assert_eq!(
            PositionState::LOCKING,
            p.get_current_position(7, 2).unwrap()
        );
        assert_eq!(
            PositionState::PREUNLOCKING,
            p.get_current_position(8, 2).unwrap()
        );
        assert_eq!(
            PositionState::PREUNLOCKING,
            p.get_current_position(11, 2).unwrap()
        );
        assert_eq!(
            PositionState::UNLOCKING,
            p.get_current_position(13, 2).unwrap()
        );
        assert_eq!(
            PositionState::UNLOCKED,
            p.get_current_position(14, 2).unwrap()
        );
    }

    #[test]
    fn lifecycle_lock() {
        let p = Position {
            activation_epoch:       8,
            unlocking_start:        None,
            target_with_parameters: TargetWithParameters::VOTING,
            amount:                 10,
            reserved:               POSITION_DATA_PADDING,
        };
        assert_eq!(
            PositionState::LOCKING,
            p.get_current_position(0, 2).unwrap()
        );
        assert_eq!(
            PositionState::LOCKING,
            p.get_current_position(7, 2).unwrap()
        );
        assert_eq!(PositionState::LOCKED, p.get_current_position(8, 2).unwrap());
        assert_eq!(
            PositionState::LOCKED,
            p.get_current_position(11, 2).unwrap()
        );
        assert_eq!(
            PositionState::LOCKED,
            p.get_current_position(300, 2).unwrap()
        );
    }
    #[test]
    fn test_serialized_size() {
        // These are 0-copy serialized, so use std::mem::size_of instead of borsh::get_packed_len
        // If this fails, we need a migration
        assert_eq!(std::mem::size_of::<Option<Position>>(), 200);
        // This one failing is much worse. If so, just change the number of positions and/or add
        // padding
        assert_eq!(std::mem::size_of::<PositionData>(), 32 + 100 * 200);
    }
}
