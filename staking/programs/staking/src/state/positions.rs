use crate::error::ErrorCode;
use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::borsh::try_from_slice_unchecked;
use anchor_lang::solana_program::wasm_bindgen;
use std::fmt::{
    self,
    Debug,
};

pub const MAX_POSITIONS: usize = 100;
// Intentionally make the buffer for positions bigger than it needs for migrations
pub const POSITION_BUFFER_SIZE: usize = 200;

pub const POSITIONS_ACCOUNT_SIZE: usize = 20040;
/// An array that contains all of a user's positions i.e. where are the staking and who are they
/// staking to.
/// The invariant we preserve is : For i < next_index, positions[i] == Some
/// For i >= next_index, positions[i] == None

#[account(zero_copy)]
#[repr(C)]
pub struct PositionData {
    pub owner: Pubkey,
    positions: [[u8; POSITION_BUFFER_SIZE]; MAX_POSITIONS],
}

#[cfg(test)]
impl Default for PositionData {
    // Only used for testing, so unwrap is acceptable
    fn default() -> Self {
        PositionData {
            owner:     Pubkey::default(),
            positions: [[0u8; POSITION_BUFFER_SIZE]; MAX_POSITIONS],
        }
    }
}
impl PositionData {
    /// Finds first index available for a new position, increments the internal counter
    pub fn reserve_new_index(&mut self, next_index: &mut u8) -> Result<usize> {
        let res = *next_index as usize;
        *next_index += 1;
        if res < MAX_POSITIONS {
            Ok(res)
        } else {
            Err(error!(ErrorCode::TooManyPositions))
        }
    }

    // Makes position at index i none, and swaps positions to preserve the invariant
    pub fn make_none(&mut self, i: usize, next_index: &mut u8) -> Result<()> {
        *next_index -= 1;
        self.positions[i] = self.positions[*next_index as usize];
        None::<Option<Position>>.try_write(&mut self.positions[i])
    }

    // Makes position at index i none, and swaps positions to preserve the invariant
    pub fn write_position(&mut self, i: usize, &position: &Position) -> Result<()> {
        Some(position).try_write(&mut self.positions[i])
    }

    pub fn read_position(&self, i: usize) -> Result<Option<Position>> {
        Option::<Position>::try_read(&self.positions[i])
    }
}

pub trait TryBorsh {
    fn try_read(slice: &[u8]) -> Result<Self>
    where
        Self: std::marker::Sized;
    fn try_write(self, slice: &mut [u8]) -> Result<()>;
}

impl<T> TryBorsh for T
where
    T: AnchorDeserialize + AnchorSerialize,
{
    fn try_read(slice: &[u8]) -> Result<Self> {
        try_from_slice_unchecked(slice).map_err(|_| error!(ErrorCode::PositionSerDe))
    }

    fn try_write(self, slice: &mut [u8]) -> Result<()> {
        let mut ptr = slice;
        self.serialize(&mut ptr)
            .map_err(|_| error!(ErrorCode::PositionSerDe))
    }
}


/// This represents a staking position, i.e. an amount that someone has staked to a particular
/// target. This is one of the core pieces of our staking design, and stores all
/// of the state related to a position The voting position is a position where the
/// target_with_parameters is VOTING
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema)]
pub struct Position {
    pub amount:                 u64,
    pub activation_epoch:       u64,
    pub unlocking_start:        Option<u64>,
    pub target_with_parameters: TargetWithParameters,
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

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq, Eq)]
pub enum TargetWithParameters {
    VOTING,
    STAKING {
        product:   Pubkey,
        publisher: Publisher,
    },
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq, Eq)]
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
                    let has_activated: bool = self.activation_epoch <= current_epoch;
                    let unlock_started: bool = unlocking_start <= current_epoch;
                    let unlock_ended: bool =
                        unlocking_start + unlocking_duration as u64 <= current_epoch;

                    if has_activated && !unlock_started {
                        Ok(PositionState::PREUNLOCKING)
                    } else if unlock_started && !unlock_ended {
                        Ok(PositionState::UNLOCKING)
                    } else {
                        Ok(PositionState::UNLOCKED)
                    }
                }
            }
        }
    }

    pub fn is_voting(&self) -> bool {
        matches!(self.target_with_parameters, TargetWithParameters::VOTING)
    }
}

/// The core states that a position can be in
#[repr(u8)]
#[wasm_bindgen]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq, Eq)]
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
        TryBorsh,
        MAX_POSITIONS,
        POSITIONS_ACCOUNT_SIZE,
        POSITION_BUFFER_SIZE,
    };
    use anchor_lang::solana_program::borsh::get_packed_len;
    #[test]
    fn lifecycle_lock_unlock() {
        let p = Position {
            activation_epoch:       8,
            unlocking_start:        Some(12),
            target_with_parameters: TargetWithParameters::VOTING,
            amount:                 10,
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
        assert_eq!(
            std::mem::size_of::<PositionData>(),
            32 + MAX_POSITIONS * POSITION_BUFFER_SIZE
        );
        assert_eq!(
            POSITIONS_ACCOUNT_SIZE,
            8 + 32 + MAX_POSITIONS * POSITION_BUFFER_SIZE
        );
        // Checks that the position struct fits in the individual position buffer
        assert!(get_packed_len::<Position>() < POSITION_BUFFER_SIZE);
    }

    #[test]
    fn test_none_is_zero() {
        // Checks that it's fine to initialize a position buffer with zeros
        let buffer = [0u8; POSITION_BUFFER_SIZE];
        assert!(Option::<Position>::try_read(&buffer).unwrap().is_none());
    }
}
