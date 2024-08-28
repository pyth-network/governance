use {
    anchor_lang::prelude::*,
    borsh::BorshSchema,
};

#[account]
#[derive(Default, BorshSchema)]
pub struct GlobalConfig {
    pub bump:                  u8,
    pub governance_authority:  Pubkey,
    pub pyth_token_mint:       Pubkey,
    pub pyth_governance_realm: Pubkey,
    // unlocking_duration is deprecated, but we need to keep it for account structure
    pub unlocking_duration:    u8,
    pub epoch_duration:        u64, // epoch duration in seconds
    pub freeze:                bool,
    pub pda_authority:         Pubkey, /* Authority that can authorize the transfer of
                                        * locked
                                        * tokens */
    pub governance_program:    Pubkey, // Governance program id

    /// Once the pyth token is listed, governance can update the config to set this value.
    /// Once this value is set, vesting schedules that depend on the token list date can start
    /// vesting.
    pub pyth_token_list_time: Option<i64>,
    pub agreement_hash:       [u8; 32],

    pub mock_clock_time: i64, /* this field needs to be greater than 0 otherwise the API
                               * will use real time */
    pub pool_authority:  Pubkey,
}

impl GlobalConfig {
    pub const LEN: usize = 10240;
}

#[cfg(test)]
pub mod tests {
    use crate::state::global_config::GlobalConfig;

    #[test]
    #[allow(deprecated)]
    fn check_size() {
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<GlobalConfig>()
                < GlobalConfig::LEN
        );
    }
}
