use {
    super::target::TargetMetadata,
    crate::{
        error::ErrorCode,
        utils::clock::UNLOCKING_DURATION,
    },
    anchor_lang::{
        prelude::{
            borsh::BorshSchema,
            ErrorCode as AnchorErrorCode,
            *,
        },
        solana_program::wasm_bindgen,
        Discriminator,
    },
    arrayref::array_ref,
    solana_program::system_instruction,
    std::{
        convert::TryInto,
        fmt::{
            self,
            Debug,
        },
    },
};

// Intentionally make the buffer for positions bigger than it needs for migrations
pub const POSITION_BUFFER_SIZE: usize = 200;

/// The header of DynamicPositionArray
#[account(zero_copy)]
#[repr(C)]
pub struct PositionData {
    pub owner: Pubkey,
}

impl PositionData {
    pub const LEN: usize = 8 + 32;
}

/// This account stores a user's positions in a dynamic sized array.
/// Its first 40 bytes are `PositionData` (including discriminator) and the rest is a
/// variable-length slice of `[u8; POSITION_BUFFER_SIZE]`. Each element of the array can be
/// deserialized into an `Option<Position>`. The old invariant is maintained: For `i < next_index`,
/// `positions[i] == Some` For `i >= next_index`, `positions[i] == None`
/// Other invariants are that `data_len() == 40 + n * POSITION_BUFFER_SIZE` where n is an integer
/// and that `data_len() >= 40 + next_index * POSITION_BUFFER_SIZE`.
/// It stores account info to get access to the data and resize.
pub struct DynamicPositionArray<'a> {
    pub acc_info: AccountInfo<'a>,
}

impl<'a> DynamicPositionArray<'a> {
    fn get_positions_slice(&self) -> Result<&mut [[u8; POSITION_BUFFER_SIZE]]> {
        let position_capacity = self.get_position_capacity();
        unsafe {
            Ok(std::slice::from_raw_parts_mut(
                self.acc_info.try_borrow_mut_data()?[PositionData::LEN..].as_mut_ptr()
                    as *mut [u8; POSITION_BUFFER_SIZE],
                position_capacity,
            ))
        }
    }

    fn data_len(&self) -> usize {
        self.acc_info.data_len()
    }

    pub fn load_init(account_loader: &AccountLoader<'a, PositionData>) -> Result<Self> {
        let acc_info = account_loader.to_account_info();
        if !acc_info.is_writable {
            return Err(AnchorErrorCode::AccountNotMutable.into());
        }

        {
            let data = acc_info.try_borrow_mut_data()?;

            // The discriminator should be zero, since we're initializing.
            let mut disc_bytes = [0u8; 8];
            disc_bytes.copy_from_slice(&data[..8]);
            let discriminator = u64::from_le_bytes(disc_bytes);
            if discriminator != 0 {
                return Err(AnchorErrorCode::AccountDiscriminatorAlreadySet.into());
            }
        }

        Ok(Self { acc_info })
    }

    pub fn load_mut(account_loader: &AccountLoader<'a, PositionData>) -> Result<Self> {
        let result = Self::load(account_loader)?;
        if !result.acc_info.is_writable {
            return Err(AnchorErrorCode::AccountNotMutable.into());
        }
        Ok(result)
    }

    pub fn load(account_loader: &AccountLoader<'a, PositionData>) -> Result<Self> {
        let acc_info = account_loader.to_account_info();

        {
            let data = acc_info.try_borrow_data()?;
            if data.len() < PositionData::discriminator().len() {
                return Err(AnchorErrorCode::AccountDiscriminatorNotFound.into());
            }

            let disc_bytes = array_ref![data, 0, 8];
            if disc_bytes != &PositionData::discriminator() {
                return Err(AnchorErrorCode::AccountDiscriminatorMismatch.into());
            }
        }
        Ok(Self { acc_info })
    }

    pub fn adjust_rent_if_needed(&self, payer: &AccountInfo<'a>) -> Result<()> {
        let rent = Rent::get()?;
        let amount_required = rent.minimum_balance(self.data_len());
        let amount_to_transfer = amount_required.saturating_sub(self.acc_info.lamports());

        if amount_to_transfer > 0 {
            let transfer_instruction =
                system_instruction::transfer(payer.key, self.acc_info.key, amount_to_transfer);

            anchor_lang::solana_program::program::invoke(
                &transfer_instruction,
                &[payer.to_account_info(), self.acc_info.clone()],
            )?;
        }

        let amount_to_withdraw = self.acc_info.lamports().saturating_sub(amount_required);

        if amount_to_withdraw > 0 {
            **payer.try_borrow_mut_lamports()? += amount_to_withdraw;
            **self.acc_info.try_borrow_mut_lamports()? -= amount_to_withdraw;
        }
        Ok(())
    }

    pub fn owner(&self) -> Result<Pubkey> {
        let data = self.acc_info.try_borrow_data()?;
        Ok(Pubkey::from(*array_ref![data, 8, 32]))
    }

    pub fn set_owner(&self, owner: &Pubkey) -> Result<()> {
        let mut data = self.acc_info.try_borrow_mut_data()?;
        data[8..40].copy_from_slice(&owner.to_bytes());
        Ok(())
    }

    pub fn get_position_capacity(&self) -> usize {
        self.acc_info.data_len().saturating_sub(PositionData::LEN) / POSITION_BUFFER_SIZE
    }

    /// Finds first index available for a new position, increments the internal counter
    pub fn reserve_new_index(&mut self, next_index: &mut u8) -> Result<usize> {
        let position_capacity: usize = self.get_position_capacity();
        let res = usize::from(*next_index);
        *next_index = next_index
            .checked_add(1)
            .ok_or_else(|| error!(ErrorCode::TooManyPositions))?;

        if res == position_capacity {
            self.realloc(next_index)?;
        }
        Ok(res)
    }

    pub fn realloc(&mut self, next_index: &u8) -> Result<()> {
        self.acc_info.realloc(
            PositionData::LEN + usize::from(*next_index) * POSITION_BUFFER_SIZE,
            false,
        )?;
        Ok(())
    }

    // Makes position at index i none, and swaps positions to preserve the invariant
    pub fn make_none(&mut self, i: usize, next_index: &mut u8) -> Result<()> {
        if usize::from(*next_index) <= i {
            return Err(error!(ErrorCode::PositionOutOfBounds));
        }
        *next_index -= 1;
        let positions = self.get_positions_slice()?;
        positions[i] = positions[usize::from(*next_index)];
        None::<Option<Position>>.try_write(&mut positions[usize::from(*next_index)])
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
        for i in 0..self.get_position_capacity() {
            if let Some(position) = self.read_position(i)? {
                if position.target_with_parameters == target_with_parameters {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    pub fn get_target_exposure(&self, target: &Target, current_epoch: u64) -> Result<u64> {
        let mut exposure: u64 = 0;
        for i in 0..self.get_position_capacity() {
            if let Some(position) = self.read_position(i)? {
                if position.target_with_parameters.get_target() == *target {
                    exposure = exposure
                        .checked_add(position.amount)
                        .ok_or_else(|| error!(ErrorCode::GenericOverflow))?;
                }
            }
        }
        Ok(exposure)
    }


    /// This function is used to reduce the number of positions in the array by merging equivalent
    /// positions. Sometimes some positions have the same `target_with_parameters`,
    /// `activation_epoch` and `unlocking_start`. These can obviously be merged, but this is not
    /// enough, for example if a user creates a position every epoch, the number of positions
    /// will grow linearly. The trick therefore is to merge positions that have an
    /// `activation_epoch` that's enough in the past that they were both active in the previous
    /// epoch and in the current epoch. However this trick only works if the user has claimed
    /// the rewards in integrity pool, otherwise we potentially need to know how far in the past the
    /// position was created to compute the rewards. Therefore the `pool_authority` should
    /// ensure rewards have been claimed before allowing merging positions.
    pub fn merge_target_positions(
        &mut self,
        current_epoch: u64,
        next_index: &mut u8,
        target_with_parameters: TargetWithParameters,
    ) -> Result<()> {
        let mut i = usize::from(*next_index);
        while i >= 1 {
            i -= 1;
            if let Some(position) = self.read_position(i)? {
                if position.target_with_parameters == target_with_parameters {
                    if position.get_current_position(current_epoch)? == PositionState::UNLOCKED {
                        self.make_none(i, next_index)?;
                    } else {
                        for j in 0..i {
                            if let Some(mut other_position) = self.read_position(j)? {
                                if position.is_equivalent(&other_position, current_epoch) {
                                    self.make_none(i, next_index)?;
                                    other_position.amount += position.amount;
                                    other_position.activation_epoch = std::cmp::min(
                                        other_position.activation_epoch,
                                        position.activation_epoch,
                                    ); // We keep the oldest activation epoch to keep information about
                                       // how long the user has been a staker
                                    self.write_position(j, &other_position)?;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    pub fn slash_positions(
        &mut self,
        current_epoch: u64,
        next_index: &mut u8,
        custody_account_amount: u64,
        publisher: &Pubkey,
        slash_ratio: u64,
        governance_target_account: &mut TargetMetadata,
    ) -> Result<SlashedAmounts> {
        require_gte!(1_000_000, slash_ratio, ErrorCode::InvalidSlashRatio);

        let mut locked_slashed = 0;
        let mut unlocking_slashed = 0;
        let mut preunlocking_slashed = 0;


        let mut i: usize = 0;
        while i < usize::from(*next_index) {
            let position = self.read_position(i)?;

            if let Some(position_data) = position {
                let prev_state = position_data.get_current_position(current_epoch - 1)?;
                let current_state = position_data.get_current_position(current_epoch)?;
                if matches!(
                    position_data.target_with_parameters,
                    TargetWithParameters::IntegrityPool { publisher: publisher_pubkey } if publisher_pubkey == *publisher,
                ) && (prev_state == PositionState::LOCKED
                    || prev_state == PositionState::PREUNLOCKING)
                {
                    // TODO: use constants
                    let to_slash: u64 =
                        ((u128::from(position_data.amount) * u128::from(slash_ratio)) / 1_000_000)
                            .try_into()?;

                    match current_state {
                        PositionState::LOCKED => {
                            locked_slashed += to_slash;
                        }
                        PositionState::UNLOCKING => {
                            unlocking_slashed += to_slash;
                        }
                        PositionState::PREUNLOCKING => {
                            preunlocking_slashed += to_slash;
                        }
                        _ => {
                            return Err(error!(ErrorCode::InvalidPosition));
                        }
                    }

                    // position_data.amount >= to_slash since slash_ratio is between 0 and 1
                    if position_data.amount - to_slash == 0 {
                        self.make_none(i, next_index)?;
                        continue;
                    } else {
                        self.write_position(
                            i,
                            &Position {
                                amount:                 position_data.amount - to_slash,
                                target_with_parameters: position_data.target_with_parameters,
                                activation_epoch:       position_data.activation_epoch,
                                unlocking_start:        position_data.unlocking_start,
                            },
                        )?;
                    }
                }
            }
            i += 1;
        }

        let governance_exposure = self.get_target_exposure(&Target::Voting, current_epoch)?;

        let total_slashed = locked_slashed + unlocking_slashed + preunlocking_slashed;
        if let Some(mut remaining) =
            (governance_exposure + total_slashed).checked_sub(custody_account_amount)
        {
            let mut i = 0;
            while i < usize::from(*next_index) && remaining > 0 {
                if let Some(position) = self.read_position(i)? {
                    let prev_state = position.get_current_position(current_epoch - 1)?;
                    let current_state = position.get_current_position(current_epoch)?;

                    if position.target_with_parameters == TargetWithParameters::Voting
                        && current_state != PositionState::UNLOCKED
                    {
                        let to_slash = remaining.min(position.amount);
                        remaining -= to_slash;

                        match prev_state {
                            PositionState::LOCKED | PositionState::PREUNLOCKING => {
                                governance_target_account
                                    .sub_prev_locked(to_slash, current_epoch)?;
                            }
                            PositionState::LOCKING
                            | PositionState::UNLOCKING
                            | PositionState::UNLOCKED => {}
                        }

                        match current_state {
                            PositionState::LOCKING => {
                                governance_target_account.add_unlocking(to_slash, current_epoch)?;
                            }
                            PositionState::LOCKED => {
                                governance_target_account.sub_locked(to_slash, current_epoch)?;
                            }
                            PositionState::PREUNLOCKING => {
                                governance_target_account.sub_locked(to_slash, current_epoch)?;
                                governance_target_account.add_locking(to_slash, current_epoch)?;
                            }
                            PositionState::UNLOCKING | PositionState::UNLOCKED => {}
                        }

                        if to_slash == position.amount {
                            self.make_none(i, next_index)?;
                            continue;
                        } else {
                            self.write_position(
                                i,
                                &Position {
                                    amount:                 position.amount - to_slash,
                                    target_with_parameters: position.target_with_parameters,
                                    activation_epoch:       position.activation_epoch,
                                    unlocking_start:        position.unlocking_start,
                                },
                            )?;
                        }
                    }
                }
                i += 1;
            }
        }

        Ok(SlashedAmounts {
            total_slashed,
            locked_slashed,
            preunlocking_slashed,
        })
    }
}

pub struct SlashedAmounts {
    pub total_slashed:        u64,
    pub locked_slashed:       u64,
    pub preunlocking_slashed: u64,
}
pub struct DynamicPositionArrayAccount {
    pub key:      Pubkey,
    pub lamports: u64,
    pub data:     Vec<u8>,
}

impl Default for DynamicPositionArrayAccount {
    fn default() -> Self {
        let key = Pubkey::new_unique();
        let lamports = 0;
        let data = vec![0; 20040]; // Leave lots of space to test the realloc
        Self {
            key,
            lamports,
            data,
        }
    }
}

impl DynamicPositionArrayAccount {
    pub fn to_dynamic_position_array(&mut self) -> DynamicPositionArray {
        let acc_info = AccountInfo::new(
            &self.key,
            false,
            false,
            &mut self.lamports,
            &mut self.data,
            &self.key,
            false,
            0,
        );
        DynamicPositionArray { acc_info }
    }

    pub fn default_with_data(data: &[u8]) -> Self {
        let key = Pubkey::new_unique();
        let lamports = 0;
        Self {
            key,
            lamports,
            data: data.to_vec(),
        }
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
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq, Eq)]
#[cfg_attr(test, derive(Hash))]
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
    pub fn get_current_position(&self, current_epoch: u64) -> Result<PositionState> {
        if current_epoch < self.activation_epoch {
            Ok(PositionState::LOCKING)
        } else {
            match self.unlocking_start {
                None => Ok(PositionState::LOCKED),
                Some(unlocking_start) => {
                    let has_activated: bool = self.activation_epoch <= current_epoch;
                    let unlock_started: bool = unlocking_start <= current_epoch;
                    let unlock_ended: bool = unlocking_start + UNLOCKING_DURATION <= current_epoch;

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

    /**
     * Two positions are equivalent if they have the same state for the current and previous
     * epoch. This is because we never check the state of a position for epochs futher in
     * the past than 1 epoch. An exception to this rule is claimimng rewards in integrity
     * pool, therefore `pool_authority` should ensure rewards have been claimed before
     * allowing merging positions.
     */
    pub fn is_equivalent(&self, other: &Position, current_epoch: u64) -> bool {
        self.get_current_position(current_epoch) == other.get_current_position(current_epoch)
            && self.get_current_position(current_epoch.saturating_sub(1))
                == other.get_current_position(current_epoch.saturating_sub(1))
            && self.target_with_parameters == other.target_with_parameters
    }

    pub fn is_voting(&self) -> bool {
        matches!(self.target_with_parameters, TargetWithParameters::Voting)
    }
}

/// The core states that a position can be in
#[repr(u8)]
#[wasm_bindgen]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
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
        super::DynamicPositionArray,
        crate::state::{
            positions::{
                DynamicPositionArrayAccount,
                Position,
                PositionData,
                PositionState,
                SlashedAmounts,
                Target,
                TargetWithParameters,
                TryBorsh,
                POSITION_BUFFER_SIZE,
            },
            target::TargetMetadata,
        },
        anchor_lang::prelude::*,
        quickcheck::{
            Arbitrary,
            Gen,
        },
        quickcheck_macros::quickcheck,
        rand::Rng,
        std::{
            collections::{
                HashMap,
                HashSet,
            },
            convert::TryInto,
        },
    };
    #[test]
    fn lifecycle_lock_unlock() {
        let p = Position {
            activation_epoch:       8,
            unlocking_start:        Some(12),
            target_with_parameters: TargetWithParameters::Voting,
            amount:                 10,
        };
        assert_eq!(PositionState::LOCKING, p.get_current_position(0).unwrap());
        assert_eq!(PositionState::LOCKING, p.get_current_position(7).unwrap());
        assert_eq!(
            PositionState::PREUNLOCKING,
            p.get_current_position(8).unwrap()
        );
        assert_eq!(
            PositionState::PREUNLOCKING,
            p.get_current_position(11).unwrap()
        );
        assert_eq!(
            PositionState::UNLOCKING,
            p.get_current_position(12).unwrap()
        );
        assert_eq!(PositionState::UNLOCKED, p.get_current_position(13).unwrap());
    }

    #[test]
    fn lifecycle_lock() {
        let p = Position {
            activation_epoch:       8,
            unlocking_start:        None,
            target_with_parameters: TargetWithParameters::Voting,
            amount:                 10,
        };
        assert_eq!(PositionState::LOCKING, p.get_current_position(0).unwrap());
        assert_eq!(PositionState::LOCKING, p.get_current_position(7).unwrap());
        assert_eq!(PositionState::LOCKED, p.get_current_position(8).unwrap());
        assert_eq!(PositionState::LOCKED, p.get_current_position(11).unwrap());
        assert_eq!(PositionState::LOCKED, p.get_current_position(300).unwrap());
    }
    #[test]
    #[allow(deprecated)]
    fn test_serialized_size() {
        assert_eq!(std::mem::size_of::<PositionData>(), 32);
        assert_eq!(PositionData::LEN, 8 + 32);
        // Checks that the position struct fits in the individual position buffer
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<Option<Position>>()
                < POSITION_BUFFER_SIZE
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
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut position_data = fixture.to_dynamic_position_array();
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


    /// Boiler plate to generate random instances
    /// We use small numbers to increase the chance that current_epoch will be equal to
    /// activation_epoch or unlocking_start

    impl Arbitrary for Position {
        fn arbitrary(g: &mut Gen) -> Self {
            let activation_epoch = u64::arbitrary(g) % 4;

            Position {
                activation_epoch,
                unlocking_start: Option::<u64>::arbitrary(g)
                    .map(|x| activation_epoch + 1 + (x % 4)),
                target_with_parameters: TargetWithParameters::arbitrary(g),
                amount: u32::arbitrary(g) as u64, // We use u32 to avoid u64 overflow
            }
        }
    }

    const FIRST_PUBLISHER: Pubkey = pubkey!("11111111111111111111111111111111");
    const SECOND_PUBLISHER: Pubkey = pubkey!("1tJ93RwaVfE1PEMxd5rpZZuPtLCwbEaDCrNBhAy8Cw");
    impl Arbitrary for TargetWithParameters {
        fn arbitrary(g: &mut Gen) -> Self {
            if bool::arbitrary(g) {
                if bool::arbitrary(g) {
                    TargetWithParameters::IntegrityPool {
                        publisher: FIRST_PUBLISHER,
                    }
                } else {
                    TargetWithParameters::IntegrityPool {
                        publisher: SECOND_PUBLISHER,
                    }
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

    impl<'a> DynamicPositionArray<'a> {
        fn to_hash_map(&self, next_index: u8) -> HashMap<Position, u64> {
            let mut res: HashMap<Position, u64> = HashMap::<Position, u64>::new();
            for i in 0..next_index {
                if let Some(position) = self.read_position(i as usize).unwrap() {
                    res.entry(position).and_modify(|e| *e += 1).or_insert(1);
                } else {
                    panic!()
                }
            }

            for i in next_index..(self.get_position_capacity() as u8) {
                assert_eq!(
                    Option::<Position>::None,
                    self.read_position(i as usize).unwrap()
                )
            }
            res
        }
    }

    fn remove_from_map(map: &mut HashMap<Position, u64>, position: &Position) {
        let value = map.get_mut(position).unwrap();
        *value -= 1;
        if *value == 0 {
            map.remove(position);
        }
    }

    #[quickcheck]
    fn prop(input: Vec<DataOperation>) -> bool {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut position_data = fixture.to_dynamic_position_array();
        let mut next_index: u8 = 0;
        let mut map: HashMap<Position, u64> = HashMap::<Position, u64>::new();
        let mut rng = rand::thread_rng();
        for op in input {
            match op {
                DataOperation::Add(position) => {
                    map.entry(position).and_modify(|e| *e += 1).or_insert(1);
                    let i = position_data.reserve_new_index(&mut next_index).unwrap();
                    position_data.write_position(i, &position).unwrap();
                }
                DataOperation::Modify(position) => {
                    if next_index != 0 {
                        let i: usize = rng.gen_range(0..(next_index as usize));
                        let current_position = position_data.read_position(i).unwrap().unwrap();
                        position_data.write_position(i, &position).unwrap();
                        map.entry(position).and_modify(|e| *e += 1).or_insert(1);
                        remove_from_map(&mut map, &current_position)
                    } else {
                        assert!(map.is_empty());
                    }
                }
                DataOperation::Delete => {
                    if next_index != 0 {
                        let i: usize = rng.gen_range(0..(next_index as usize));
                        let current_position = position_data.read_position(i).unwrap().unwrap();
                        position_data.make_none(i, &mut next_index).unwrap();
                        remove_from_map(&mut map, &current_position)
                    } else {
                        assert!(map.is_empty());
                    }
                }
            }

            if map != position_data.to_hash_map(next_index) {
                return false;
            };
        }
        map == position_data.to_hash_map(next_index)
    }

    #[quickcheck]
    fn optimize_positions(positions: Vec<Position>, epoch: u8) -> bool {
        let epoch = (epoch % 8) as u64;
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut dynamic_position_array = fixture.to_dynamic_position_array();
        let mut next_index: u8 = 0;

        let mut pre_position_buckets: HashMap<
            (TargetWithParameters, PositionState, PositionState),
            u64,
        > = HashMap::new();
        for &position in positions.iter() {
            let current_state = position.get_current_position(epoch).unwrap();
            let previous_state = position
                .get_current_position(epoch.saturating_sub(1))
                .unwrap();

            if current_state != PositionState::UNLOCKED {
                pre_position_buckets
                    .entry((
                        position.target_with_parameters,
                        previous_state,
                        current_state,
                    ))
                    .and_modify(|e| *e += position.amount)
                    .or_insert(position.amount);
            }

            let index = dynamic_position_array
                .reserve_new_index(&mut next_index)
                .unwrap();
            dynamic_position_array
                .write_position(index, &position)
                .unwrap();
        }

        dynamic_position_array
            .merge_target_positions(
                epoch,
                &mut next_index,
                TargetWithParameters::IntegrityPool {
                    publisher: FIRST_PUBLISHER,
                },
            )
            .unwrap();
        dynamic_position_array
            .merge_target_positions(epoch, &mut next_index, TargetWithParameters::Voting)
            .unwrap();
        dynamic_position_array
            .merge_target_positions(
                epoch,
                &mut next_index,
                TargetWithParameters::IntegrityPool {
                    publisher: SECOND_PUBLISHER,
                },
            )
            .unwrap();

        let mut hash_set: HashSet<(TargetWithParameters, PositionState, PositionState)> =
            HashSet::new();
        let mut post_position_buckets: HashMap<
            (TargetWithParameters, PositionState, PositionState),
            u64,
        > = HashMap::new();
        for i in 0..next_index {
            if let Some(position) = dynamic_position_array.read_position(i as usize).unwrap() {
                let current_state = position.get_current_position(epoch).unwrap();
                let previous_state = position
                    .get_current_position(epoch.saturating_sub(1))
                    .unwrap();

                if hash_set.contains(&(
                    position.target_with_parameters,
                    previous_state,
                    current_state,
                )) {
                    return false; // we should not have have two positions that are equivalent after
                                  // merging
                }
                hash_set.insert((
                    position.target_with_parameters,
                    previous_state,
                    current_state,
                ));

                post_position_buckets
                    .entry((
                        position.target_with_parameters,
                        previous_state,
                        current_state,
                    ))
                    .and_modify(|e| *e += position.amount)
                    .or_insert(position.amount);
            }
        }

        if pre_position_buckets != post_position_buckets {
            return false;
        }

        true
    }


    #[quickcheck]
    fn slash_position(positions: Vec<Position>, epoch: u8, slash_ratio: u64) -> bool {
        let epoch = ((epoch % 7) + 1) as u64;
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut dynamic_position_array = fixture.to_dynamic_position_array();
        let mut next_index: u8 = 0;
        let slash_ratio = slash_ratio % 1_000_000;

        let mut amount_slashable_locked: u64 = 0;
        let mut amount_slashable_preunlocking: u64 = 0;

        let mut pre_position_buckets: HashMap<
            (TargetWithParameters, PositionState, PositionState),
            u64,
        > = HashMap::new();
        for &position in positions.iter() {
            let current_state = position.get_current_position(epoch).unwrap();
            let previous_state = position
                .get_current_position(epoch.saturating_sub(1))
                .unwrap();

            pre_position_buckets
                .entry((
                    position.target_with_parameters,
                    previous_state,
                    current_state,
                ))
                .and_modify(|e| *e += position.amount)
                .or_insert(position.amount);

            if (position.target_with_parameters
                == TargetWithParameters::IntegrityPool {
                    publisher: FIRST_PUBLISHER,
                })
            {
                if previous_state == PositionState::LOCKED {
                    amount_slashable_locked += position.amount;
                }
                if (previous_state == PositionState::PREUNLOCKING)
                    && (current_state == PositionState::PREUNLOCKING)
                {
                    amount_slashable_preunlocking += position.amount;
                }
            }

            let index = dynamic_position_array
                .reserve_new_index(&mut next_index)
                .unwrap();
            dynamic_position_array
                .write_position(index, &position)
                .unwrap();
        }

        let mut governance_target_account = {
            let governance_prev_epoch_locked = pre_position_buckets
                .iter()
                .filter(|((target, prev_state, _), _)| {
                    *target == TargetWithParameters::Voting
                        && (*prev_state == PositionState::LOCKED
                            || *prev_state == PositionState::PREUNLOCKING)
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();

            let governance_locked = pre_position_buckets
                .iter()
                .filter(|((target, _, curr_state), _)| {
                    *target == TargetWithParameters::Voting
                        && (*curr_state == PositionState::LOCKED
                            || *curr_state == PositionState::PREUNLOCKING)
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();

            let governance_delta_locked = pre_position_buckets
                .iter()
                .filter(|((target, _, curr_state), _)| {
                    *target == TargetWithParameters::Voting
                        && (*curr_state == PositionState::PREUNLOCKING
                            || *curr_state == PositionState::LOCKING)
                })
                .map(|((_, _, curr_state), amount)| {
                    if *curr_state == PositionState::LOCKING {
                        *amount as i64
                    } else {
                        -(*amount as i64)
                    }
                })
                .sum::<i64>();

            TargetMetadata {
                bump:              0,
                last_update_at:    epoch,
                prev_epoch_locked: governance_prev_epoch_locked,
                locked:            governance_locked,
                delta_locked:      governance_delta_locked,
            }
        };

        let expected_slashed = {
            let slashable_locked = pre_position_buckets
                .iter()
                .filter(|((target, prev_state, _), _)| {
                    *target
                        == TargetWithParameters::IntegrityPool {
                            publisher: FIRST_PUBLISHER,
                        }
                        && (*prev_state == PositionState::LOCKED)
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();


            let slashable_preunlocking = pre_position_buckets
                .iter()
                .filter(|((target, prev_state, curr_state), _)| {
                    *target
                        == TargetWithParameters::IntegrityPool {
                            publisher: FIRST_PUBLISHER,
                        }
                        && *prev_state == PositionState::PREUNLOCKING
                        && *curr_state == PositionState::PREUNLOCKING
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();

            let slashable_total = pre_position_buckets
                .iter()
                .filter(|((target, prev_state, _), _)| {
                    *target
                        == TargetWithParameters::IntegrityPool {
                            publisher: FIRST_PUBLISHER,
                        }
                        && (*prev_state == PositionState::LOCKED
                            || *prev_state == PositionState::PREUNLOCKING)
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();

            let locked_slashed = (slash_ratio as u128 * slashable_locked as u128 / 1_000_000)
                .try_into()
                .unwrap();


            let preunlocking_slashed = (slash_ratio as u128 * slashable_preunlocking as u128
                / 1_000_000)
                .try_into()
                .unwrap();

            let total_slashed = (slash_ratio as u128 * slashable_total as u128 / 1_000_000)
                .try_into()
                .unwrap();

            SlashedAmounts {
                total_slashed,
                locked_slashed,
                preunlocking_slashed,
            }
        };

        let governance_exposure = dynamic_position_array
            .get_target_exposure(&Target::Voting, epoch)
            .unwrap();

        let publisher_1_exposure = pre_position_buckets
            .iter()
            .filter(|((target, _, _), _)| {
                *target
                    == TargetWithParameters::IntegrityPool {
                        publisher: FIRST_PUBLISHER,
                    }
            })
            .map(|((_, _, _), amount)| *amount)
            .sum::<u64>();

        let publisher_2_exposure = pre_position_buckets
            .iter()
            .filter(|((target, _, _), _)| {
                *target
                    == TargetWithParameters::IntegrityPool {
                        publisher: SECOND_PUBLISHER,
                    }
            })
            .map(|((_, _, _), amount)| *amount)
            .sum::<u64>();


        let custody_account_amount = std::cmp::max(
            governance_exposure,
            publisher_1_exposure + publisher_2_exposure,
        );

        let SlashedAmounts {
            total_slashed,
            locked_slashed,
            preunlocking_slashed,
        } = dynamic_position_array
            .slash_positions(
                epoch,
                &mut next_index,
                custody_account_amount,
                &FIRST_PUBLISHER,
                slash_ratio,
                &mut governance_target_account,
            )
            .unwrap();


        let mut post_position_buckets: HashMap<
            (TargetWithParameters, PositionState, PositionState),
            u64,
        > = HashMap::new();
        for i in 0..next_index {
            if let Some(position) = dynamic_position_array.read_position(i as usize).unwrap() {
                let current_state = position.get_current_position(epoch).unwrap();
                let previous_state = position
                    .get_current_position(epoch.saturating_sub(1))
                    .unwrap();

                post_position_buckets
                    .entry((
                        position.target_with_parameters,
                        previous_state,
                        current_state,
                    ))
                    .and_modify(|e| *e += position.amount)
                    .or_insert(position.amount);
            }
        }


        // Check the returned amount slashed is as expected
        if !((expected_slashed.total_slashed >= total_slashed)
            && (total_slashed
                >= expected_slashed
                    .total_slashed
                    .saturating_sub(next_index.into())))
        {
            return false;
        }

        if !((expected_slashed.locked_slashed >= locked_slashed)
            && (locked_slashed
                >= expected_slashed
                    .locked_slashed
                    .saturating_sub(next_index.into())))
        {
            return false;
        }

        if !((expected_slashed.preunlocking_slashed >= preunlocking_slashed)
            && (preunlocking_slashed
                >= expected_slashed
                    .preunlocking_slashed
                    .saturating_sub(next_index.into())))
        {
            return false;
        }

        // check governance exposure has been reduced by the correct amount
        let post_governance_exposure = dynamic_position_array
            .get_target_exposure(&Target::Voting, epoch)
            .unwrap();

        if post_governance_exposure
            != std::cmp::min(governance_exposure, custody_account_amount - total_slashed)
        {
            return false;
        }

        // governance accounting update is correct
        let post_governance_target_account = {
            let governance_prev_epoch_locked = post_position_buckets
                .iter()
                .filter(|((target, prev_state, _), _)| {
                    *target == TargetWithParameters::Voting
                        && (*prev_state == PositionState::LOCKED
                            || *prev_state == PositionState::PREUNLOCKING)
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();

            let governance_locked = post_position_buckets
                .iter()
                .filter(|((target, _, curr_state), _)| {
                    *target == TargetWithParameters::Voting
                        && (*curr_state == PositionState::LOCKED
                            || *curr_state == PositionState::PREUNLOCKING)
                })
                .map(|((_, _, _), amount)| *amount)
                .sum::<u64>();

            let governance_delta_locked = post_position_buckets
                .iter()
                .filter(|((target, _, curr_state), _)| {
                    *target == TargetWithParameters::Voting
                        && (*curr_state == PositionState::PREUNLOCKING
                            || *curr_state == PositionState::LOCKING)
                })
                .map(|((_, _, curr_state), amount)| {
                    if *curr_state == PositionState::LOCKING {
                        *amount as i64
                    } else {
                        -(*amount as i64)
                    }
                })
                .sum::<i64>();

            TargetMetadata {
                bump:              0,
                last_update_at:    epoch,
                prev_epoch_locked: governance_prev_epoch_locked,
                locked:            governance_locked,
                delta_locked:      governance_delta_locked,
            }
        };

        if post_governance_target_account != governance_target_account {
            return false;
        }

        let mut post_amount_slashable_locked = 0;
        let mut post_amount_slashed_preunlocking = 0;

        for (target, prev_state, curr_state) in pre_position_buckets.keys() {
            // slashing doesn't affect this target
            if (target
                == &TargetWithParameters::IntegrityPool {
                    publisher: SECOND_PUBLISHER,
                })
                && pre_position_buckets.get(&(*target, *prev_state, *curr_state))
                    != post_position_buckets.get(&(*target, *prev_state, *curr_state))
            {
                return false;
            }

            // slashing doesn't affect positions that are not locked or preunlocking in the previous
            // epoch
            if (target
                == &TargetWithParameters::IntegrityPool {
                    publisher: FIRST_PUBLISHER,
                })
                && prev_state != &PositionState::LOCKED
                && prev_state != &PositionState::PREUNLOCKING
                && pre_position_buckets.get(&(*target, *prev_state, *curr_state))
                    != post_position_buckets.get(&(*target, *prev_state, *curr_state))
            {
                return false;
            }

            // slashing affects positions that are locked or preunlocking with ratio slash_ratio
            if (target
                == &TargetWithParameters::IntegrityPool {
                    publisher: FIRST_PUBLISHER,
                })
                && (prev_state == &PositionState::LOCKED
                    || prev_state == &PositionState::PREUNLOCKING)
            {
                let expected_slashed: u64 = (*pre_position_buckets
                    .get(&(*target, *prev_state, *curr_state))
                    .unwrap() as u128
                    * slash_ratio as u128
                    / 1_000_000)
                    .try_into()
                    .unwrap();
                let pre_slashable = *pre_position_buckets
                    .get(&(*target, *prev_state, *curr_state))
                    .unwrap();
                let post_slashable = *post_position_buckets
                    .get(&(*target, *prev_state, *curr_state))
                    .unwrap_or(&0);
                let slashed = pre_slashable - post_slashable;

                if !((expected_slashed >= slashed)
                    && (slashed >= expected_slashed.saturating_sub(next_index.into())))
                {
                    return false;
                }

                if prev_state == &PositionState::LOCKED {
                    post_amount_slashable_locked += post_slashable;
                }
                if prev_state == &PositionState::PREUNLOCKING
                    && curr_state == &PositionState::PREUNLOCKING
                {
                    post_amount_slashed_preunlocking += post_slashable;
                }
            }


            // slashing reduces governance positions
            if (target == &TargetWithParameters::Voting)
                && pre_position_buckets.get(&(*target, *prev_state, *curr_state))
                    < post_position_buckets.get(&(*target, *prev_state, *curr_state))
            {
                return false;
            }

            if target == &TargetWithParameters::Voting
                && curr_state == &PositionState::UNLOCKED
                && pre_position_buckets.get(&(*target, *prev_state, *curr_state))
                    != post_position_buckets.get(&(*target, *prev_state, *curr_state))
            {
                return false;
            }
        }

        // the returned values match the position updates
        if locked_slashed != amount_slashable_locked - post_amount_slashable_locked {
            return false;
        }

        if preunlocking_slashed != amount_slashable_preunlocking - post_amount_slashed_preunlocking
        {
            return false;
        }

        true
    }
}
