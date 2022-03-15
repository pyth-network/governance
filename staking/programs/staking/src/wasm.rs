use crate::borsh::BorshSerialize;
use crate::state::positions::{PositionData, MAX_POSITIONS};
use anchor_lang::{prelude::Error, AccountDeserialize, Discriminator};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmPositionData {
    wrapped: PositionData,
}

#[wasm_bindgen]
impl WasmPositionData { 
    #[wasm_bindgen(constructor)]
    pub fn from_buffer(buffer: &[u8]) -> WasmPositionData {
        let mut ptr = buffer;
        let position_data = PositionData::try_deserialize(&mut ptr).unwrap();
        WasmPositionData {
            wrapped: position_data,
        }
    }
    #[wasm_bindgen(getter, js_name=borshLength)]
    pub fn get_borsh_length(&self) -> usize {
        // We could serialize and get the length, but this is way cheaper
        MAX_POSITIONS * (1 + 8 + 8 + 9 + 33 + 33)
    }
    /// Serialize this account using Borsh so that Anchor can deserialize it
    #[wasm_bindgen(js_name=asBorsh)]
    pub fn as_borsh(&self, output_buffer: &mut [u8]) -> Result<(), JsValue> {
        log_error(self.as_borsh_impl(output_buffer))
    }
    fn as_borsh_impl(&self, output_buffer: &mut [u8]) -> Result<(), Error> {
        // TODO: Borsh panics if the buffer is too large, so we do this inefficient
        // copy. IIRC Solana has some rust code that works around this problem.
        let serialized = self.wrapped.try_to_vec()?;
        let len = serialized.len();
        output_buffer[0..8].copy_from_slice(&PositionData::discriminator());
        output_buffer[8..(len + 8)].copy_from_slice(&serialized[..]);
        Ok(())
    }
    #[wasm_bindgen(js_name=getUnlocked)]
    pub fn get_unlocked(&self, current_epoch: u64) -> Result<u64, JsValue> {
        log_error(self.wrapped.get_unlocked(current_epoch))
    }
    #[wasm_bindgen(js_name=getLocked)]
    pub fn get_locked(&self, current_epoch: u64) -> Result<u64, JsValue> {
        log_error(self.wrapped.get_locked(current_epoch))
    }
    #[wasm_bindgen(js_name=getWithdrawable)]
    pub fn get_widthdrawable(
        &self,
        total_balance: u64,
        unvested_balance: u64,
        current_epoch: u64,
        unlocking_duration: u8,
    ) -> Result<u64, JsValue> {
        log_error(crate::utils::risk::validate(
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
        log_error(self.wrapped.get_unused_index())
    }
}

fn log_error<T, E>(return_val: Result<T, E>) -> Result<T, JsValue>
where
    E: std::fmt::Display,
{
    match return_val {
        Ok(x) => Ok(x),
        Err(e) => {
            log(&e.to_string());
            Err(e.to_string().into())
        }
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}
