#[allow(non_camel_case_types)]
// It is used to store fractional numbers with 6 decimal places
// The number 6 is coming from the decimal places of the PYTH token
pub type frac64 = u64;

pub const FRAC_64_MULTIPLIER: u64 = 1_000_000;
pub const FRAC_64_MULTIPLIER_U128: u128 = FRAC_64_MULTIPLIER as u128;
