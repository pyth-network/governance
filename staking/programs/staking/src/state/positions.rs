use crate::borsh::BorshSerialize;
use crate::error::ErrorCode;
use anchor_lang::error::Error;
use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::wasm_bindgen;
use bytemuck::{
    Pod,
    Zeroable,
};
use std::convert::{
    TryFrom,
    TryInto,
};
use std::fmt::{
    self,
    Debug,
};

pub const MAX_POSITIONS: usize = 100;
pub const POSITION_DATA_PADDING: [u64; 10] = [0u64; 10];

/// An array that contains all of a user's positions i.e. where are the staking and who are they
/// staking to.
/// The invariant we preserve is : For i < next_index, positions[i] == Some
/// For i >= next_index, positions[i] == None
#[account(zero_copy)]
#[derive(BorshSchema, BorshSerialize)]
pub struct PositionData {
    pub owner:     Pubkey,
    pub positions: [[u8; 200]; MAX_POSITIONS],
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
    pub fn make_none(&mut self, i: usize, next_index: &mut u8) {
        *next_index -= 1;
        self.positions[i] = self.positions[*next_index as usize];
        self.positions[*next_index as usize] = into_buffer(None);
    }
}

pub fn into_buffer(option: Option<Position>) -> [u8; 200] {
    return option.try_to_vec().unwrap().try_into().unwrap();
}

pub fn from_buffer(buffer: [u8; 200]) -> Option<Position> {
    return Option::<Position>::try_from_slice(&buffer).unwrap();
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
}


#[derive(Pod, Zeroable, Copy, Clone, BorshSchema, AnchorSerialize, AnchorDeserialize)]
#[repr(C)]
pub struct UnlockingStartPod {
    tag:             u64,
    unlocking_start: u64,
}

impl From<Option<u64>> for UnlockingStartPod {
    fn from(option: Option<u64>) -> Self {
        match option {
            None => UnlockingStartPod {
                tag:             0,
                unlocking_start: u64::zeroed(),
            },
            Some(unlocking_start) => UnlockingStartPod {
                tag: 1,
                unlocking_start,
            },
        }
    }
}


impl TryInto<Option<u64>> for UnlockingStartPod {
    type Error = Error;
    fn try_into(self) -> Result<Option<u64>> {
        match self.tag {
            0 => Ok(None),
            1 => Ok(Some(self.unlocking_start)),
            _ => Err(error!(ErrorCode::IllegalPositionPod)),
        }
    }
}


#[derive(Pod, Zeroable, Copy, Clone, BorshSchema, AnchorSerialize, AnchorDeserialize)]
#[repr(C)]
pub struct PositionPod {
    pub amount:                 u64,
    pub activation_epoch:       u64,
    pub unlocking_start:        UnlockingStartPod,
    pub target_with_parameters: TargetWithParametersPod,
    pub reserved:               [u64; 10],
}

impl From<Position> for PositionPod {
    fn from(position: Position) -> Self {
        PositionPod {
            amount:                 position.amount,
            activation_epoch:       position.activation_epoch,
            unlocking_start:        position.unlocking_start.into(),
            target_with_parameters: position.target_with_parameters.into(),
            reserved:               POSITION_DATA_PADDING,
        }
    }
}

impl TryInto<Position> for PositionPod {
    type Error = Error;
    fn try_into(self) -> Result<Position> {
        Ok(Position {
            amount:                 self.amount,
            activation_epoch:       self.activation_epoch,
            unlocking_start:        self.unlocking_start.try_into()?,
            target_with_parameters: self.target_with_parameters.try_into()?,
        })
    }
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


#[derive(Pod, Zeroable, Copy, Clone, BorshSchema, AnchorSerialize, AnchorDeserialize)]
#[repr(C)]
pub struct PublisherPod {
    tag:     u64,
    address: Pubkey,
}

impl From<Publisher> for PublisherPod {
    fn from(publisher: Publisher) -> Self {
        match publisher {
            Publisher::DEFAULT => PublisherPod {
                tag:     0,
                address: Pubkey::default(),
            },
            Publisher::SOME { address } => PublisherPod { tag: 1, address },
        }
    }
}

impl TryInto<Publisher> for PublisherPod {
    type Error = Error;
    fn try_into(self) -> Result<Publisher> {
        match self.tag {
            0 => Ok(Publisher::DEFAULT),

            1 => Ok(Publisher::SOME {
                address: self.address,
            }),
            _ => Err(error!(ErrorCode::IllegalPositionPod)),
        }
    }
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
        return matches!(self.target_with_parameters, TargetWithParameters::VOTING);
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
        OptionPod,
        Position,
        PositionData,
        PositionState,
        TargetWithParameters,
    };
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
        // These are 0-copy serialized, so use std::mem::size_of instead of borsh::get_packed_len
        // If this fails, we need a migration
        assert_eq!(std::mem::size_of::<OptionPod>(), 200);
        // This one failing is much worse. If so, just change the number of positions and/or add
        // padding
        assert_eq!(std::mem::size_of::<PositionData>(), 32 + 100 * 200);
    }
}
