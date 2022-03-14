use crate::borsh::BorshSerialize;
use crate::state::positions::PositionData;
use anchor_lang::{prelude::Error, AccountDeserialize, Discriminator};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
/// Parses a PositionData account from buffer in the zero-copy "serialized" format 
/// (which is not really serialized) and serialize it properly using Borsh. Anchor
/// knows how to deserialize the Borsh version.
pub fn convert_positions_account(buffer: &[u8], borsh: &mut [u8]) -> i16 {
    match convert_positions_account_impl(buffer, borsh) {
        Ok(_) => 0,
        Err(e) => {
            log(&e.to_string());
            -1
        }
    }
}

fn convert_positions_account_impl(buffer: &[u8], borsh: &mut [u8]) -> Result<(), Error> {
    let mut ptr = buffer;
    let position_data = PositionData::try_deserialize(&mut ptr)?;
    let serialized = position_data.try_to_vec()?;
    let len = serialized.len();
    borsh[0..8].copy_from_slice(&PositionData::discriminator());
    borsh[8..(len + 8)].copy_from_slice(&serialized[..]);
    Ok(())
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}
