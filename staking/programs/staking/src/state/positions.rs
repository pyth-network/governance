use crate::error::ErrorCode;
use anchor_lang::prelude::*;

pub const MAX_POSITIONS: usize = 100;

/// An array that contains all of a user's positions i.e. where are the staking and who are they staking to
/// We mostly fill it front to back, but indicies don't mean much.
/// Because users can close positions, it might get fragmented.
#[account(zero_copy)]
pub struct PositionData {
    pub positions: [Option<Position>; MAX_POSITIONS],
}

impl PositionData {
    pub fn get_unlocked(&self, current_epoch: u64) -> Result<u64> {
        Err(error!(ErrorCode::NotImplemented))
    }
    pub fn get_locked(&self, current_epoch: u64) -> Result<u64> {
        Err(error!(ErrorCode::NotImplemented))
    }

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

/// This represents a staking position, i.e. an amount that someone has staked to a particular (product, publisher) tuple.
/// This is one of the core pieces of our staking design, and stores all of the state related to a position
/// The voting position is a position where the product is None
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub struct Position {
    pub amount: u64,
    pub activation_epoch: u64,
    pub unlocking_start: Option<u64>,
    pub product: Option<Pubkey>,
    pub publisher: Option<Pubkey>,
} // TODO: Decide if we want to reserve some space here for reward tracking state

impl Position {
    /// Managing the state of a position is tricky because we can only update the data when a user makes a transaction
    /// but many of the state transitions take effect later, e.g. at the next epoch boundary.
    /// In order to get the actual current state, we need the current epoch. This encapsulates that logic
    /// so that other parts of the code can use the actual state.
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
                        Ok(PositionState::LOCKED)
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
}

/// The core states that a position can be in
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq)]
pub enum PositionState {
    UNLOCKED,
    LOCKING,
    LOCKED,
    UNLOCKING,
}

#[cfg(test)]
pub mod tests {
    use crate::state::positions::{Position, PositionState};
    use anchor_lang::prelude::*;

    #[test]
    fn lifecycle_lock_unlock() {
        let p = Position {
            activation_epoch: 8,
            unlocking_start: Some(12),
            product: None,
            publisher: None,
            amount: 10,
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
            activation_epoch: 8,
            unlocking_start: None,
            product: None,
            publisher: None,
            amount: 10,
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
}
