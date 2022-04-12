use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct GlobalConfig {
    pub bump:                  u8,
    pub governance_authority:  Pubkey,
    pub pyth_token_mint:       Pubkey,
    pub pyth_governance_realm: Pubkey,
    pub unlocking_duration:    u8,
    pub epoch_duration:        u64, // epoch duration in seconds
    #[cfg(feature = "mock-clock")]
    pub mock_clock_time:       i64, /* this field needs to be greater than 0 otherwise the API
                                     * will use real time */
}
