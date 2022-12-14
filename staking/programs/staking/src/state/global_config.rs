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

    // Once the pyth token is listed, governance can update the config to set this value.
    // Once this value is set, vesting schedules that depend on the token list date can start vesting.
    // FIXME: do options serialize correctly? iirc there was some issue about this
    pub pyth_token_list_time:       Option<i64>,
}
