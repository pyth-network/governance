use anchor_lang::prelude::*;
use crate::error::ErrorCode;

#[account(zero_copy)]
pub struct PositionData{
    pub positions: [StakeAccountPosition; 100],
}

/// This represents a staking position, i.e. an amount that someone has staked to a particular (product, publisher) tuple.
/// This is one of the core pieces of our staking design, and stores all of the state related to a position
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, Default)]
pub struct StakeAccountPosition {
    pub amount: u64,
    pub product: Pubkey,
    pub publisher: Pubkey,
    pub activation_epoch: u64,
    pub unlocking_start: u64,
    // TODO: Decide if we want to reserve some space here for reward tracking state
}

impl StakeAccountPosition {
    /// Managing the state of a position is tricky because we can only update the data when a user makes a transaction
    /// but many of the state transitions take effect later, e.g. at the next epoch boundary.
    /// In order to get the actual current state, we need the current epoch. This encapsulates that logic
    /// so that other parts of the code can use the actual state.
    pub fn get_current_position(
        &self,
        current_epoch: u64,
        unlocking_duration: u64,
    ) -> Result<PositionState, ProgramError> {
        if current_epoch < self.activation_epoch - 1 {
            Ok(PositionState::ILLEGAL)
        } else if current_epoch < self.activation_epoch {
            Ok(PositionState::LOCKING)
        } else {
            match self.unlocking_start {
                u64::MAX => Ok(PositionState::LOCKED),
                _ => {
                    if (self.activation_epoch <= current_epoch) && (current_epoch < self.unlocking_start)
                    {
                        Ok(PositionState::LOCKED)
                    } else if (self.unlocking_start <= current_epoch)
                        && (current_epoch < self.unlocking_start + unlocking_duration)
                    {
                        Ok(PositionState::UNLOCKING)
                    } else {
                        Ok(PositionState::UNLOCKED)
                    }
                }
                
            }
        }
    }

    pub fn get_unlocked(
        &self,
        current_epoch : u64
    ) -> Result<u64, ProgramError>
    {
        Err(ErrorCode::NotImplemented.into())
    }
    pub fn get_locked(
        &self,
        current_epoch : u64
    ) -> Result<u64, ProgramError>
    {
        Err(ErrorCode::NotImplemented.into())
    }

    pub fn get_current_exposure_to_product(
        &self,
        current_epoch : u64,
        product : Pubkey
    ) -> Result<u64, ProgramError>
    {
        Err(ErrorCode::NotImplemented.into())
    }
}

/// The core states that a position can be in
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq)]
pub enum PositionState {
    ILLEGAL,
    UNLOCKED,
    LOCKING,
    LOCKED,
    UNLOCKING,
}

#[cfg(test)]
pub mod tests {
    use crate::state::positions::{PositionState, StakeAccountPosition};
    use anchor_lang::prelude::*;

    #[test]
    fn lifecycle_lock_unlock() {
        let p = StakeAccountPosition {
            activation_epoch: 8,
            unlocking_start: 12,
            product: Pubkey::default(),
            publisher: Pubkey::default(),
            amount: 10,
        };
        assert_eq!(
            PositionState::ILLEGAL,
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
        let p = StakeAccountPosition {
            activation_epoch: 8,
            unlocking_start: u64::MAX,
            product: Pubkey::default(),
            publisher: Pubkey::default(),
            amount: 10,
        };
        assert_eq!(
            PositionState::ILLEGAL,
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
