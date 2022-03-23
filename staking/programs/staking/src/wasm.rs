use crate::state::positions::{PositionData};
use anchor_lang::{prelude::{Error, Clock}, AccountDeserialize, Discriminator, AnchorDeserialize};
use wasm_bindgen::prelude::*;
use std::io::Write;
use crate::VestingSchedule;
use anchor_lang::solana_program::borsh::get_packed_len;
use borsh::BorshSerialize;


#[wasm_bindgen]
pub struct WasmPositionData {
    wrapped: PositionData,
}

#[wasm_bindgen]
impl WasmPositionData {
    #[wasm_bindgen(constructor)]
    pub fn from_buffer(buffer: &[u8]) -> Result<WasmPositionData, JsValue> {
        convert_error(WasmPositionData::from_buffer_impl(buffer))
    }
    fn from_buffer_impl(buffer: &[u8]) -> Result<WasmPositionData, Error> {
        let mut ptr = buffer;
        let position_data = PositionData::try_deserialize(&mut ptr)?;
        Ok(WasmPositionData {
            wrapped: position_data,
        })
    }

    #[wasm_bindgen(getter, js_name=borshLength)]
    pub fn get_borsh_length(&self) -> usize {
        get_packed_len::<PositionData>()
    }
    /// Serialize this account using Borsh so that Anchor can deserialize it
    #[wasm_bindgen(js_name=asBorsh)]
    pub fn as_borsh(&self, output_buffer: &mut [u8]) -> Result<(), JsValue> {
        convert_error(self.as_borsh_impl(output_buffer))
    }
    fn as_borsh_impl(&self, output_buffer: &mut [u8]) -> Result<(), Error> {
        let mut writer = output_buffer;
        writer.write_all(&PositionData::discriminator())?;
        self.wrapped.serialize(&mut writer)?;
        Ok(())
    }
    #[wasm_bindgen(js_name=getUnlocked)]
    pub fn get_unlocked(&self, current_epoch: u64) -> Result<u64, JsValue> {
        convert_error(self.wrapped.get_unlocked(current_epoch))
    }
    #[wasm_bindgen(js_name=getLocked)]
    pub fn get_locked(&self, current_epoch: u64) -> Result<u64, JsValue> {
        convert_error(self.wrapped.get_locked(current_epoch))
    }
    #[wasm_bindgen(js_name=getWithdrawable)]
    pub fn get_widthdrawable(
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

    /// Finds first index available for a new position
    #[wasm_bindgen(js_name=getUnusedIndex)]
    pub fn get_unused_index(&self) -> Result<usize, JsValue> {
        convert_error(self.wrapped.get_unused_index())
    }
}

#[wasm_bindgen(js_name=getUnvestedBalance)]
pub fn get_unvested_balance(vestingSchedBorsh: &[u8], currentTime: i64) -> Result<u64, JsValue> {
    convert_error(get_unvested_balance_impl(vestingSchedBorsh, currentTime))
}
fn get_unvested_balance_impl(vesting_sched_borsh: &[u8], current_time: i64) -> anchor_lang::Result<u64> {
    let mut ptr = vesting_sched_borsh;
    let vs = VestingSchedule::deserialize(&mut ptr)?;
    vs.get_unvested_balance(current_time)
}


#[wasm_bindgen(js_name=getUnixTime)]
/// Deserializes the contents of the SYSVAR_CLOCK account (onChainSerialized), returning the 
/// Unix time field
pub fn get_unix_time(onChainSerialized: &[u8]) -> Result<i64, JsValue> {
    convert_error(get_unix_time_impl(onChainSerialized))
}
fn get_unix_time_impl(on_chain_serialized: &[u8]) -> anchor_lang::Result<i64> {
    let clock : Clock = bincode::deserialize(on_chain_serialized).map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
    Ok(clock.unix_timestamp)
}

/// Most of the Rust code returns anchor_lang::Result<T>, which is core::result::Result<T, anchor_lang::error::Error>
/// in order to return a result via WASM, we need to return a core::result::Result<T, JsValue>
/// and anchor_lang::error::Error is not convertible to a JsValue. This method manually converts it
/// by making a generic error that has the right error message.
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
// Define a macro to re-export these constants to prevent copy-paste errors (already almost made one)
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

#[wasm_bindgen]
impl Constants {
    #[wasm_bindgen]
    pub fn ANCHOR_DISCRIMINATOR_SIZE() -> usize {
        //anchor_lang::Discriminator::discriminator().len()
        8
    }
    #[wasm_bindgen]
    pub fn MAX_POSITIONS() -> usize {
        crate::state::positions::MAX_POSITIONS
    }
    #[wasm_bindgen]
    pub fn POSITIONS_ACCOUNT_SIZE() -> usize {
        Constants::ANCHOR_DISCRIMINATOR_SIZE() + std::mem::size_of::<PositionData>()
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}
