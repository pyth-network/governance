#![allow(non_snake_case)]
use crate::error::ErrorCode;
use crate::state::max_voter_weight_record::MAX_VOTER_WEIGHT;
use crate::state::positions::{
    PositionData,
    PositionState,
    MAX_POSITIONS,
    POSITIONS_ACCOUNT_SIZE,
};
use crate::state::target::TargetMetadata;
use crate::state::vesting::VestingEvent;
use crate::{
    VestingSchedule,
    GOVERNANCE_PROGRAM,
};
use anchor_lang::prelude::{
    error,
    Clock,
    Error,
};
use anchor_lang::{
    AccountDeserialize,
    AnchorDeserialize,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmPositionData {
    wrapped: PositionData,
}

#[wasm_bindgen]
pub struct LockedBalanceSummary {
    pub locking:      u64,
    pub locked:       u64,
    pub unlocking:    u64,
    pub preunlocking: u64,
}

#[wasm_bindgen]
impl WasmPositionData {
    #[wasm_bindgen(constructor)]
    pub fn from_buffer(buffer: &[u8]) -> Result<WasmPositionData, JsValue> {
        convert_error(WasmPositionData::from_buffer_impl(
            &buffer[..POSITIONS_ACCOUNT_SIZE],
        ))
    }
    fn from_buffer_impl(buffer: &[u8]) -> Result<WasmPositionData, Error> {
        let mut ptr = buffer;
        let position_data = PositionData::try_deserialize(&mut ptr)?;
        Ok(WasmPositionData {
            wrapped: position_data,
        })
    }

    #[wasm_bindgen(js_name=getPositionState)]
    pub fn get_position_state(
        &self,
        index: u16,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> Result<PositionState, JsValue> {
        convert_error(self.get_position_state_impl(index, current_epoch, unlocking_duration))
    }
    fn get_position_state_impl(
        &self,
        index: u16,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> anchor_lang::Result<PositionState> {
        self.wrapped
            .read_position(index as usize)?
            .ok_or_else(|| error!(ErrorCode::PositionNotInUse))?
            .get_current_position(current_epoch, unlocking_duration)
    }
    #[wasm_bindgen(js_name=isPositionVoting)]
    pub fn is_position_voting(&self, index: u16) -> Result<bool, JsValue> {
        convert_error(self.is_position_voting_impl(index))
    }
    fn is_position_voting_impl(&self, index: u16) -> anchor_lang::Result<bool> {
        Ok(self
            .wrapped
            .read_position(index as usize)?
            .ok_or_else(|| error!(ErrorCode::PositionNotInUse))?
            .is_voting())
    }

    /// Adds up the balance of positions grouped by position state: locking, locked, and unlocking.
    /// This way of computing balances only makes sense in the pre-data staking world, but it's
    /// helpful for now.
    #[wasm_bindgen(js_name=getLockedBalanceSummary)]
    pub fn get_locked_balance_summary(
        &self,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> Result<LockedBalanceSummary, JsValue> {
        convert_error(self.get_locked_balance_summary_impl(current_epoch, unlocking_duration))
    }
    fn get_locked_balance_summary_impl(
        &self,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> anchor_lang::Result<LockedBalanceSummary> {
        let mut locking: u64 = 0;
        let mut locked: u64 = 0;
        let mut unlocking: u64 = 0;
        let mut preunlocking: u64 = 0;

        for i in 0..MAX_POSITIONS {
            if let Some(position) = self.wrapped.read_position(i)? {
                match position.get_current_position(current_epoch, unlocking_duration)? {
                    PositionState::LOCKING => {
                        locking = locking
                            .checked_add(position.amount)
                            .ok_or(error!(ErrorCode::GenericOverflow))?;
                    }
                    PositionState::LOCKED => {
                        locked = locked
                            .checked_add(position.amount)
                            .ok_or(error!(ErrorCode::GenericOverflow))?;
                    }
                    PositionState::PREUNLOCKING => {
                        preunlocking = preunlocking
                            .checked_add(position.amount)
                            .ok_or(error!(ErrorCode::GenericOverflow))?;
                    }
                    PositionState::UNLOCKING => {
                        unlocking = unlocking
                            .checked_add(position.amount)
                            .ok_or(error!(ErrorCode::GenericOverflow))?;
                    }
                    _ => {}
                }
            }
        }
        Ok(LockedBalanceSummary {
            locking,
            locked,
            unlocking,
            preunlocking,
        })
    }

    #[wasm_bindgen(js_name=getWithdrawable)]
    pub fn get_withdrawable(
        &self,
        total_balance: u64,
        unvested_balance: u64,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> Result<u64, JsValue> {
        convert_error(crate::utils::risk::validate(
            &self.wrapped,
            total_balance,
            unvested_balance,
            current_epoch,
            unlocking_duration,
        ))
    }

    #[wasm_bindgen(js_name=getVoterWeight)]
    pub fn get_voter_weight(
        &self,
        current_epoch: u64,
        unlocking_duration: u8,
        current_locked: u64,
    ) -> Result<u64, JsValue> {
        convert_error(crate::utils::voter_weight::compute_voter_weight(
            &self.wrapped,
            current_epoch,
            unlocking_duration,
            current_locked,
            MAX_VOTER_WEIGHT,
        ))
    }
}

#[wasm_bindgen]
pub struct WasmTargetMetadata {
    wrapped: TargetMetadata,
}

#[wasm_bindgen]
impl WasmTargetMetadata {
    #[wasm_bindgen(constructor)]
    pub fn from_buffer(buffer: &[u8]) -> Result<WasmTargetMetadata, JsValue> {
        convert_error(WasmTargetMetadata::from_buffer_impl(buffer))
    }
    fn from_buffer_impl(buffer: &[u8]) -> Result<WasmTargetMetadata, Error> {
        let mut ptr = buffer;
        let target_data = TargetMetadata::try_deserialize(&mut ptr)?;
        Ok(WasmTargetMetadata {
            wrapped: target_data,
        })
    }

    #[wasm_bindgen(js_name=getCurrentAmountLocked)]
    pub fn get_current_amount_locked(&self, current_epoch: u64) -> Result<u64, JsValue> {
        convert_error(self.wrapped.get_current_amount_locked(current_epoch))
    }
}

#[wasm_bindgen(js_name=getNextVesting)]
pub fn get_next_vesting(
    vestingSchedBorsh: &[u8],
    currentTime: i64,
    tokenListingTime: Option<i64>,
) -> Result<Option<VestingEvent>, JsValue> {
    convert_error(get_next_vesting_impl(vestingSchedBorsh, currentTime, tokenListingTime))
}
fn get_next_vesting_impl(
    vesting_sched_borsh: &[u8],
    current_time: i64,
    tokenListingTime: Option<i64>,
) -> anchor_lang::Result<Option<VestingEvent>> {
    let mut ptr = vesting_sched_borsh;
    let vs = VestingSchedule::deserialize(&mut ptr)?;
    vs.get_next_vesting(current_time, tokenListingTime)
}

#[wasm_bindgen(js_name=getUnvestedBalance)]
pub fn get_unvested_balance(vestingSchedBorsh: &[u8], currentTime: i64, tokenListingTime: Option<i64>,) -> Result<u64, JsValue> {
    convert_error(get_unvested_balance_impl(vestingSchedBorsh, currentTime, tokenListingTime))
}
fn get_unvested_balance_impl(
    vesting_sched_borsh: &[u8],
    current_time: i64,
    tokenListingTime: Option<i64>,
) -> anchor_lang::Result<u64> {
    let mut ptr = vesting_sched_borsh;
    let vs = VestingSchedule::deserialize(&mut ptr)?;
    vs.get_unvested_balance(current_time, tokenListingTime)
}

#[wasm_bindgen(js_name=getUnixTime)]
/// Deserializes the contents of the SYSVAR_CLOCK account (onChainSerialized), returning the
/// Unix time field
pub fn get_unix_time(onChainSerialized: &[u8]) -> Result<i64, JsValue> {
    convert_error(get_unix_time_impl(onChainSerialized))
}
fn get_unix_time_impl(on_chain_serialized: &[u8]) -> anchor_lang::Result<i64> {
    let clock: Clock = bincode::deserialize(on_chain_serialized)
        .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
    Ok(clock.unix_timestamp)
}

/// Most of the Rust code returns anchor_lang::Result<T>, which is core::result::Result<T,
/// anchor_lang::error::Error> in order to return a result via WASM, we need to return a
/// core::result::Result<T, JsValue> and anchor_lang::error::Error is not convertible to a JsValue.
/// This method manually converts it by making a generic error that has the right error message.
fn convert_error<T, E>(return_val: Result<T, E>) -> Result<T, JsValue>
where
    E: std::fmt::Display,
{
    match return_val {
        Ok(x) => Ok(x),
        Err(e) => Err(e.to_string().into()),
    }
}

#[wasm_bindgen]
pub struct Constants {}
// Define a macro to re-export these constants to prevent copy-paste errors (already almost made
// one)
macro_rules! reexport_seed_const {
    ( $c:ident ) => {
        #[wasm_bindgen]
        impl Constants {
            #[wasm_bindgen]
            pub fn $c() -> js_sys::JsString {
                crate::context::$c.into()
            }
        }
    };
}

reexport_seed_const!(AUTHORITY_SEED);
reexport_seed_const!(CUSTODY_SEED);
reexport_seed_const!(STAKE_ACCOUNT_METADATA_SEED);
reexport_seed_const!(CONFIG_SEED);
reexport_seed_const!(VOTER_RECORD_SEED);
reexport_seed_const!(TARGET_SEED);
reexport_seed_const!(MAX_VOTER_RECORD_SEED);
reexport_seed_const!(VOTING_TARGET_SEED);
reexport_seed_const!(DATA_TARGET_SEED);

#[wasm_bindgen]
impl Constants {
    #[wasm_bindgen]
    pub fn MAX_POSITIONS() -> usize {
        crate::state::positions::MAX_POSITIONS
    }
    #[wasm_bindgen]
    pub fn POSITIONS_ACCOUNT_SIZE() -> usize {
        POSITIONS_ACCOUNT_SIZE
    }
    #[wasm_bindgen]
    pub fn MAX_VOTER_WEIGHT() -> u64 {
        crate::state::max_voter_weight_record::MAX_VOTER_WEIGHT
    }
    pub fn POSITION_BUFFER_SIZE() -> usize {
        crate::state::positions::POSITION_BUFFER_SIZE
    }
    pub fn GOVERNANCE_PROGRAM() -> js_sys::JsString {
        GOVERNANCE_PROGRAM.to_string().into()
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}
