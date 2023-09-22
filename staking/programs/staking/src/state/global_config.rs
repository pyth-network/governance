use {
    crate::error::ErrorCode,
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
    pub unlocking_duration:    u8,
    pub epoch_duration:        u64, // epoch duration in seconds
    pub freeze:                bool,

    /// Once the pyth token is listed, governance can update the config to set this value.
    /// Once this value is set, vesting schedules that depend on the token list date can start
    /// vesting.
    pub pyth_token_list_time: Option<i64>,

    #[cfg(feature = "mock-clock")]
    pub mock_clock_time: i64, /* this field needs to be greater than 0 otherwise the API
                               * will use real time */
}

impl GlobalConfig {
    pub const LEN: usize = 10240;
}

impl GlobalConfig {
    // Checks freeze flag and raises error
    pub fn check_frozen(&self) -> Result<()> {
        if self.freeze {
            Err(error!(ErrorCode::Frozen))
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
pub mod tests {
    use {
        crate::state::global_config::GlobalConfig,
        anchor_lang::prelude::*,
    };

    #[test]
    fn test_unfrozen() {
        let c = GlobalConfig {
            bump:                                           0,
            governance_authority:                           Pubkey::default(),
            pyth_token_mint:                                Pubkey::default(),
            pyth_governance_realm:                          Pubkey::default(),
            unlocking_duration:                             1,
            epoch_duration:                                 1, // epoch duration in seconds
            freeze:                                         false,
            pyth_token_list_time:                           None,
            #[cfg(feature = "mock-clock")]
            mock_clock_time:                                0,
        };

        assert!(c.check_frozen().is_ok())
    }

    #[test]
    fn test_frozen() {
        let c = GlobalConfig {
            bump:                                           0,
            governance_authority:                           Pubkey::default(),
            pyth_token_mint:                                Pubkey::default(),
            pyth_governance_realm:                          Pubkey::default(),
            unlocking_duration:                             1,
            epoch_duration:                                 1, // epoch duration in seconds
            freeze:                                         true,
            pyth_token_list_time:                           None,
            #[cfg(feature = "mock-clock")]
            mock_clock_time:                                0,
        };

        assert!(c.check_frozen().is_err())
    }

    #[test]
    fn check_size() {
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<GlobalConfig>()
                < GlobalConfig::LEN
        );
    }
}
