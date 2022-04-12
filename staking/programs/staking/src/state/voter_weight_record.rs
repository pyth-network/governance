use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;

pub const VOTER_WEIGHT_RECORD_SIZE: usize = 156;

/// Copied this struct from https://github.com/solana-labs/solana-program-library/blob/master/governance/addin-api/src/voter_weight.rs
/// Anchor has a macro (vote_weight_record) that is supposed to generate this struct, but it doesn't
/// work because the error's macros are not updated for anchor 0.22.0.
/// Even if it did work, the type wouldn't show up in the IDL. SPL doesn't produce an API, which
/// means that means we'd need the equivalent of this code on the client side.
/// If Anchor fixes the macro, we might consider changing it
#[account]
#[derive(BorshSchema)]
pub struct VoterWeightRecord {
    /// VoterWeightRecord discriminator sha256("account:VoterWeightRecord")[..8]
    /// Note: The discriminator size must match the addin implementing program discriminator size
    /// to ensure it's stored in the private space of the account data and it's unique
    /// pub account_discriminator: [u8; 8],

    /// The Realm the VoterWeightRecord belongs to
    pub realm: Pubkey,

    /// Governing Token Mint the VoterWeightRecord is associated with
    /// Note: The addin can take deposits of any tokens and is not restricted to the community or
    /// council tokens only
    // The mint here is to link the record to either community or council mint of the realm
    pub governing_token_mint: Pubkey,

    /// The owner of the governing token and voter
    /// This is the actual owner (voter) and corresponds to TokenOwnerRecord.governing_token_owner
    pub governing_token_owner: Pubkey,

    /// Voter's weight
    /// The weight of the voter provided by the addin for the given realm, governing_token_mint and
    /// governing_token_owner (voter)
    pub voter_weight: u64,

    /// The slot when the voting weight expires
    /// It should be set to None if the weight never expires
    /// If the voter weight decays with time, for example for time locked based weights, then the
    /// expiry must be set As a common pattern Revise instruction to update the weight should
    /// be invoked before governance instruction within the same transaction and the expiry set
    /// to the current slot to provide up to date weight
    pub voter_weight_expiry: Option<u64>,

    /// The governance action the voter's weight pertains to
    /// It allows to provided voter's weight specific to the particular action the weight is
    /// evaluated for When the action is provided then the governance program asserts the
    /// executing action is the same as specified by the addin
    pub weight_action: Option<VoterWeightAction>,

    /// The target the voter's weight  action pertains to
    /// It allows to provided voter's weight specific to the target the weight is evaluated for
    /// For example when addin supplies weight to vote on a particular proposal then it must
    /// specify the proposal as the action target When the target is provided then the
    /// governance program asserts the target is the same as specified by the addin
    pub weight_action_target: Option<Pubkey>,

    /// Reserved space for future versions
    pub reserved: [u8; 8],
}
/// The governance action VoterWeight is evaluated for
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema)]
pub enum VoterWeightAction {
    /// Cast vote for a proposal. Target: Proposal
    CastVote,

    /// Comment a proposal. Target: Proposal
    CommentProposal,

    /// Create Governance within a realm. Target: Realm
    CreateGovernance,

    /// Create a proposal for a governance. Target: Governance
    CreateProposal,

    /// Signs off a proposal for a governance. Target: Proposal
    /// Note: SignOffProposal is not supported in the current version
    SignOffProposal,
}


#[cfg(test)]
pub mod tests {
    use crate::state::voter_weight_record::{
        VoterWeightRecord,
        VOTER_WEIGHT_RECORD_SIZE,
    };

    #[test]
    fn check_size() {
        assert_eq!(
            anchor_lang::solana_program::borsh::get_packed_len::<VoterWeightRecord>(),
            VOTER_WEIGHT_RECORD_SIZE
        );
    }
}
