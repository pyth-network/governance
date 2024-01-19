use anchor_lang::prelude::{
    borsh::BorshSchema,
    *,
};

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy, PartialEq, Debug, BorshSchema)]
pub struct EvmPubkey(pub [u8; Self::LEN]);
impl EvmPubkey {
    pub const LEN: usize = 20;
}

#[cfg(test)]
pub mod tests {
    use {
        super::*,
        anchor_lang::solana_program::borsh,
    };

    #[test]
    fn check_size() {
        assert_eq!(EvmPubkey::LEN, borsh::get_packed_len::<EvmPubkey>());
    }
}
