use {
    anchor_lang::prelude::*,
    borsh::BorshSchema,
    common_utils::frac64::frac64,
};

#[account]
#[derive(BorshSchema)]
pub struct SlashEvent {
    pub epoch:         u64,
    pub slash_ratio:   frac64,
    pub slash_custody: Pubkey,
    pub publisher:     Pubkey,
}

impl SlashEvent {
    pub const LEN: usize = 8 + 8 + 8 + 32 + 32;
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        anchor_lang::Discriminator,
    };

    #[test]
    #[allow(deprecated)]
    fn test_slash_event_len() {
        assert!(
            solana_sdk::borsh0_10::get_packed_len::<SlashEvent>()
                + SlashEvent::discriminator().len()
                == SlashEvent::LEN
        );
    }
}
