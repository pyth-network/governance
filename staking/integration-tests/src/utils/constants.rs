use integrity_pool::utils::types::{
    frac64,
    FRAC_64_MULTIPLIER,
};

// 100 PYTH tokens
pub const STAKED_TOKENS: frac64 = 100 * FRAC_64_MULTIPLIER;

// 10% yield per epoch
pub const YIELD: frac64 = FRAC_64_MULTIPLIER / 10;
