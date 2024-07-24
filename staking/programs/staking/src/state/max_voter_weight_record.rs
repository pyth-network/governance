use anchor_lang::prelude::{
    borsh::BorshSchema,
    *,
};

pub const MAX_VOTER_WEIGHT: u64 = 10_000_000_000_000_000; // 10 Billion with 6 decimals

/// Copied this struct from https://github.com/solana-labs/solana-program-library/blob/master/governance/addin-api/src/max_voter_weight.rs
#[account]
#[derive(BorshSchema)]
pub struct MaxVoterWeightRecord {
    /// The Realm the MaxVoterWeightRecord belongs to
    pub realm: Pubkey,

    /// Governing Token Mint the MaxVoterWeightRecord is associated with
    /// Note: The addin can take deposits of any tokens and is not restricted to the community or
    /// council tokens only
    // The mint here is to link the record to either community or council mint of the realm
    pub governing_token_mint: Pubkey,

    /// Max voter weight
    /// The max voter weight provided by the addin for the given realm and governing_token_mint
    pub max_voter_weight: u64,

    /// The slot when the max voting weight expires
    /// It should be set to None if the weight never expires
    /// If the max vote weight decays with time, for example for time locked based weights, then
    /// the expiry must be set As a pattern Revise instruction to update the max weight should
    /// be invoked before governance instruction within the same transaction and the expiry set
    /// to the current slot to provide up to date weight
    pub max_voter_weight_expiry: Option<u64>,

    /// Reserved space for future versions
    pub reserved: [u8; 8],
}

impl MaxVoterWeightRecord {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 9 + 8;
}

#[cfg(test)]
pub mod tests {
    use {
        crate::state::max_voter_weight_record::MaxVoterWeightRecord,
        anchor_lang::Discriminator,
    };

    #[test]
    #[allow(deprecated)]
    fn check_size() {
        assert_eq!(
            anchor_lang::solana_program::borsh::get_packed_len::<MaxVoterWeightRecord>()
                + MaxVoterWeightRecord::discriminator().len(),
            MaxVoterWeightRecord::LEN
        );
    }
}
