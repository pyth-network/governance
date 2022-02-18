use anchor_lang::prelude::*;
use crate::error::ErrorCode;
use crate::utils::clock::EpochNum;

pub const MAX_POSITIONS : usize = 100;
pub const VOTING_POSITION: Pubkey = Pubkey::new_from_array([0; 32]);

/// An array that contains all of a user's positions i.e. where are the staking and who are they staking to
/// We mostly fill it front to back, but indicies don't mean much. 
/// Because users can close positions, it might get fragmented.
/// If a position has in_use==false (they all start that way), it is free and can be overwritten.
/// We should not read anything from positions where in_use == false.
#[account(zero_copy)]
pub struct PositionData{
    pub positions: [Position; MAX_POSITIONS],
}

impl PositionData{

    pub fn get_unlocked(
        &self,
        current_epoch : EpochNum
    ) -> Result<u64, ProgramError>
    {
        Err(ErrorCode::NotImplemented.into())
    }
    pub fn get_locked(
        &self,
        current_epoch : EpochNum
    ) -> Result<u64, ProgramError>
    {
        Err(ErrorCode::NotImplemented.into())
    }

    /// Finds first index available for a new position
    pub fn get_unused_index(
        &self
    ) -> Result<usize, ProgramError> {
        for i in 0..MAX_POSITIONS {
            if !self.positions[i].in_use {
                return Ok(i);
            }
        }
        return Err(ErrorCode::TooManyPositions.into());
    }
}

/// This represents a staking position, i.e. an amount that someone has staked to a particular (product, publisher) tuple.
/// This is one of the core pieces of our staking design, and stores all of the state related to a position
/// The voting position is a position where the product is VOTING_POSITION.
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, Default)]
pub struct Position {
    pub in_use: bool,
    pub amount: u64,
    pub product: Pubkey,
    pub publisher: Pubkey,
    pub activation_epoch: EpochNum,
    pub unlocking_start: EpochNum,
    // TODO: Decide if we want to reserve some space here for reward tracking state
}

impl Position {
    /// Managing the state of a position is tricky because we can only update the data when a user makes a transaction
    /// but many of the state transitions take effect later, e.g. at the next epoch boundary.
    /// In order to get the actual current state, we need the current epoch. This encapsulates that logic
    /// so that other parts of the code can use the actual state.
    pub fn get_current_position(
        &self,
        current_epoch: EpochNum,
        unlocking_duration: u8,
    ) -> Result<PositionState, ProgramError> {
        if !self.in_use {
            return Err(ErrorCode::PositionNotInUse.into());
        } else if current_epoch < self.activation_epoch {
            Ok(PositionState::LOCKING)
        } else {
            match self.unlocking_start {
                EpochNum::MAX => Ok(PositionState::LOCKED),
                _ => {
                    if (self.activation_epoch <= current_epoch) && (current_epoch < self.unlocking_start)
                    {
                        Ok(PositionState::LOCKED)
                    } else if (self.unlocking_start <= current_epoch)
                        && (current_epoch < self.unlocking_start + unlocking_duration as EpochNum)
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
    use crate::state::positions::{PositionState, Position};
    use crate::utils::clock::EpochNum;
    use anchor_lang::prelude::*;

    #[test]
    fn lifecycle_lock_unlock() {
        let p = Position {
            in_use: true,
            activation_epoch: 8,
            unlocking_start: 12,
            product: Pubkey::default(),
            publisher: Pubkey::default(),
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
        assert_eq!(
            PositionState::LOCKED,
            p.get_current_position(8, 2).unwrap()
        );
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
            in_use: true,
            activation_epoch: 8,
            unlocking_start: EpochNum::MAX,
            product: Pubkey::default(),
            publisher: Pubkey::default(),
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
