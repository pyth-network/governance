use {
    anchor_lang::prelude::*,
    borsh::BorshSchema,
};

#[account]
#[derive(Default, BorshSchema)]
pub struct SplitRequest {
    pub amount:    u64,
    pub recipient: Pubkey,
}

impl SplitRequest {
    pub const LEN: usize = 8 // Discriminant
                         + 8 // Amount
                         + 32; // Recipient
}
