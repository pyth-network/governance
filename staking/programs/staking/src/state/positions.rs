use {
    crate::error::ErrorCode,
    anchor_lang::{
        prelude::{
            borsh::BorshSchema,
            *,
        },
        solana_program::wasm_bindgen,
        Discriminator,
    },
    std::{
        fmt::{
            self,
            Debug,
        },
        mem::size_of,
        sync::PoisonError,
    },
};

pub const MAX_POSITIONS: usize = 20;
// Intentionally make the buffer for positions bigger than it needs for migrations
pub const POSITION_BUFFER_SIZE: usize = 200;

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

impl PositionData {
    pub const LEN: usize = 8 + 32 + MAX_POSITIONS * POSITION_BUFFER_SIZE;
}

impl Default for PositionData {
    // Only used for testing, so unwrap is acceptable
    fn default() -> Self {
        PositionData {
            owner:     Pubkey::default(),
            positions: [[0u8; POSITION_BUFFER_SIZE]; MAX_POSITIONS],
        }
    }
}

// pub struct DynamicPositionArrayFixture {
//     pub key : Pubkey,
//     pub lamports : u64,
//     pub data : Vec<u8>
// }

// impl DynamicPositionArrayFixture {
//     pub fn to_dynamic_position_array(&mut self) -> DynamicPositionArray{
//         let account_info = AccountInfo::new(&self, false, false, self.lamports, &self.data,
// &self.key, false, 0);         DynamicPositionArray::new(AccountLoader::new(account_info))
//     }
// }

pub struct DynamicPositionArray<'a> {
    account_info: AccountInfo<'a>, // We store account info to get access to the data and resize
}

impl<'a> DynamicPositionArray<'a> {
    pub fn new(stake_account_positions: AccountLoader<'a, PositionData>) -> Self {
        Self {
            account_info: stake_account_positions.to_account_info(),
        }
    }

    pub const HEADER_LEN: usize = 8 + 32;

    fn get_position_capacity(&self) -> usize {
        self.account_info
            .data_len()
            .saturating_sub(Self::HEADER_LEN)
            / PositionData::LEN
    }

    fn get_positions_slice(&self) -> Result<&mut [[u8; POSITION_BUFFER_SIZE]]> {
        let position_capacity = self.get_position_capacity();
        unsafe {
            Ok(std::slice::from_raw_parts_mut(
                self.account_info.try_borrow_mut_data()?[Self::HEADER_LEN..].as_mut_ptr()
                    as *mut [u8; POSITION_BUFFER_SIZE],
                position_capacity,
            ))
        }
    }

    pub fn initialize(&mut self, owner: &Pubkey) -> Result<()> {
        Ok(
            self.account_info.try_borrow_mut_data()?[PositionData::discriminator().len()
                ..PositionData::discriminator().len() + std::mem::size_of::<Pubkey>()]
                .copy_from_slice(&owner.to_bytes()),
        )
    }

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
        if (*next_index as usize) <= i {
            return Err(error!(ErrorCode::PositionOutOfBounds));
        }
        *next_index -= 1;
        let positions = self.get_positions_slice()?;
        positions[i] = positions[*next_index as usize];
        None::<Option<Position>>.try_write(&mut positions[*next_index as usize])
    }

    pub fn write_position(&mut self, i: usize, &position: &Position) -> Result<()> {
        let positions = self.get_positions_slice()?;
        Some(position).try_write(&mut positions[i])
    }

    pub fn read_position(&self, i: usize) -> Result<Option<Position>> {
        let positions = self.get_positions_slice()?;
        Option::<Position>::try_read(
            positions
                .get(i)
                .ok_or_else(|| error!(ErrorCode::PositionOutOfBounds))?,
        )
    }

    pub fn has_target_with_parameters_exposure(
        &self,
        target_with_parameters: TargetWithParameters,
    ) -> Result<bool> {
        let positions = self.get_positions_slice()?;
        for i in 0..positions.len() {
            if let Some(position) = self.read_position(i)? {
                if position.target_with_parameters == target_with_parameters {
                    return Ok(true);
                }
            }
        }
        Ok(false)
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
        let mut slice_mut = slice;
        T::deserialize(&mut slice_mut).map_err(|_| error!(ErrorCode::PositionSerDe))
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
#[cfg_attr(test, derive(Hash, PartialEq, Eq))]
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
    Voting,
    IntegrityPool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq, Eq)]
#[cfg_attr(test, derive(Hash))]
pub enum TargetWithParameters {
    Voting,
    IntegrityPool { publisher: Pubkey },
}

impl TargetWithParameters {
    pub fn get_target(&self) -> Target {
        match *self {
            TargetWithParameters::Voting => Target::Voting,
            TargetWithParameters::IntegrityPool { .. } => Target::IntegrityPool,
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
        matches!(self.target_with_parameters, TargetWithParameters::Voting)
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
        write!(f, "{self:?}")
    }
}

#[cfg(test)]
pub mod tests {
    use {
        crate::state::positions::{
            Position,
            PositionData,
            PositionState,
            TargetWithParameters,
            TryBorsh,
            MAX_POSITIONS,
            POSITION_BUFFER_SIZE,
        },
        anchor_lang::prelude::*,
        quickcheck::{
            Arbitrary,
            Gen,
        },
        quickcheck_macros::quickcheck,
        rand::Rng,
        std::collections::HashSet,
    };
    #[test]
    fn lifecycle_lock_unlock() {
        let p = Position {
            activation_epoch:       8,
            unlocking_start:        Some(12),
            target_with_parameters: TargetWithParameters::Voting,
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
            target_with_parameters: TargetWithParameters::Voting,
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
    #[allow(deprecated)]
    fn test_serialized_size() {
        assert_eq!(
            std::mem::size_of::<PositionData>(),
            32 + MAX_POSITIONS * POSITION_BUFFER_SIZE
        );
        assert_eq!(
            PositionData::LEN,
            8 + 32 + MAX_POSITIONS * POSITION_BUFFER_SIZE
        );
        // Checks that the position struct fits in the individual position buffer
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<Position>() < POSITION_BUFFER_SIZE
        );
    }

    #[test]
    fn test_none_is_zero() {
        // Checks that it's fine to initialize a position buffer with zeros
        let buffer = [0u8; POSITION_BUFFER_SIZE];
        assert!(Option::<Position>::try_read(&buffer).unwrap().is_none());
    }

    #[test]
    fn test_has_target_with_parameters_exposure() {
        let mut position_data = PositionData::default();
        let position = Position {
            activation_epoch:       8,
            unlocking_start:        Some(12),
            target_with_parameters: TargetWithParameters::Voting,
            amount:                 10,
        };
        let target_with_parameters = TargetWithParameters::IntegrityPool {
            publisher: Pubkey::new_unique(),
        };
        let position_2 = Position {
            activation_epoch: 4,
            unlocking_start: Some(6),
            target_with_parameters,
            amount: 20,
        };
        position_data.write_position(0, &position).unwrap();
        position_data.write_position(1, &position_2).unwrap();
        assert!(position_data
            .has_target_with_parameters_exposure(TargetWithParameters::Voting)
            .unwrap());
        assert!(position_data
            .has_target_with_parameters_exposure(target_with_parameters)
            .unwrap());
        assert!(!position_data
            .has_target_with_parameters_exposure(TargetWithParameters::IntegrityPool {
                publisher: Pubkey::new_unique(),
            })
            .unwrap());
    }

    // A vector of DataOperation will be tested on both our struct and on a HashSet
    #[derive(Clone, Debug)]
    enum DataOperation {
        Add(Position),
        Modify(Position),
        Delete,
    }

    // Boiler plate to generate random instances
    impl Arbitrary for Position {
        fn arbitrary(g: &mut Gen) -> Self {
            Position {
                activation_epoch:       u64::arbitrary(g),
                unlocking_start:        Option::<u64>::arbitrary(g),
                target_with_parameters: TargetWithParameters::Voting,
                amount:                 u64::arbitrary(g),
            }
        }
    }
    impl Arbitrary for TargetWithParameters {
        fn arbitrary(g: &mut Gen) -> Self {
            if bool::arbitrary(g) {
                TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
                }
            } else {
                TargetWithParameters::Voting
            }
        }
    }
    impl Arbitrary for DataOperation {
        fn arbitrary(g: &mut Gen) -> Self {
            let sample = u8::arbitrary(g);
            match sample % 3 {
                0 => DataOperation::Add(Position::arbitrary(g)),
                1 => DataOperation::Modify(Position::arbitrary(g)),
                2 => DataOperation::Delete,
                _ => panic!(),
            }
        }
    }

    impl PositionData {
        fn to_set(self, next_index: u8) -> HashSet<Position> {
            let mut res: HashSet<Position> = HashSet::new();
            for i in 0..next_index {
                if let Some(position) = self.read_position(i as usize).unwrap() {
                    if res.contains(&position) {
                        panic!()
                    } else {
                        res.insert(position);
                    }
                } else {
                    panic!()
                }
            }

            for i in next_index..(MAX_POSITIONS as u8) {
                assert_eq!(
                    Option::<Position>::None,
                    self.read_position(i as usize).unwrap()
                )
            }
            res
        }
    }

    #[quickcheck]
    fn prop(input: Vec<DataOperation>) -> bool {
        let mut position_data = PositionData::default();
        let mut next_index: u8 = 0;
        let mut set: HashSet<Position> = HashSet::new();
        let mut rng = rand::thread_rng();
        for op in input {
            match op {
                DataOperation::Add(position) => {
                    if next_index < MAX_POSITIONS as u8 {
                        set.insert(position);
                        let i = position_data.reserve_new_index(&mut next_index).unwrap();
                        position_data.write_position(i, &position).unwrap();
                    } else {
                        assert!(set.len() == MAX_POSITIONS);
                        assert!(position_data.reserve_new_index(&mut next_index).is_err());
                        next_index -= 1;
                    }
                }
                DataOperation::Modify(position) => {
                    if next_index != 0 {
                        let i: usize = rng.gen_range(0..(next_index as usize));
                        let current_position = position_data.read_position(i).unwrap().unwrap();
                        position_data.write_position(i, &position).unwrap();
                        set.remove(&current_position);
                        set.insert(position);
                    } else {
                        assert!(set.is_empty());
                    }
                }
                DataOperation::Delete => {
                    if next_index != 0 {
                        let i: usize = rng.gen_range(0..(next_index as usize));
                        let current_position = position_data.read_position(i).unwrap().unwrap();
                        position_data.make_none(i, &mut next_index).unwrap();
                        set.remove(&current_position);
                    } else {
                        assert!(set.is_empty());
                    }
                }
            }

            if set != position_data.to_set(next_index) {
                return false;
            };
        }
        set == position_data.to_set(next_index)
    }
}
