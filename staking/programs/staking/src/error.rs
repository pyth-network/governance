use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq, Eq)]
pub enum ErrorCode {
    #[msg("Too much exposure to product")] //6000
    TooMuchExposureToProduct,
    #[msg("Too much exposure to governance")] //6001
    TooMuchExposureToGovernance,
    #[msg("Tokens not yet vested")] //6002
    TokensNotYetVested,
    #[msg("Risk limit exceeded")] //6003
    RiskLimitExceeded,
    #[msg("Number of position limit reached")] //6004
    TooManyPositions,
    #[msg("Position not in use")] //6005
    PositionNotInUse,
    #[msg("New position needs to have positive balance")] //6006
    CreatePositionWithZero,
    #[msg("Closing a position of 0 is not allowed")] //6007
    ClosePositionWithZero,
    #[msg("Invalid product/publisher pair")] //6008
    InvalidPosition,
    #[msg("Amount to unlock bigger than position")] //6009
    AmountBiggerThanPosition,
    #[msg("Position already unlocking")] //6010
    AlreadyUnlocking,
    #[msg("Epoch duration is 0")] //6011
    ZeroEpochDuration,
    #[msg("Owner needs to own destination account")] //6012
    WithdrawToUnauthorizedAccount,
    #[msg("Insufficient balance to cover the withdrawal")] //6013
    InsufficientWithdrawableBalance,
    #[msg("Target in position doesn't match target in instruction data")] //6014
    WrongTarget,
    #[msg("An arithmetic operation unexpectedly overflowed")] //6015
    GenericOverflow,
    #[msg("Locked balance must be positive")] //6016
    NegativeBalance,
    #[msg("Protocol is frozen")] //6017
    Frozen,
    #[msg("Not allowed when not debugging")] //6018
    DebuggingOnly,
    #[msg("Proposal too long")] //6019
    ProposalTooLong,
    #[msg("Voting epoch is either too old or hasn't started")] //6020
    InvalidVotingEpoch,
    #[msg("Voting hasn't started")] //6021
    ProposalNotActive,
    #[msg("Extra governance account required")] //6022
    NoRemainingAccount,
    #[msg("Unauthorized caller")] //6023
    Unauthorized,
    #[msg("Precondition to upgrade account violated")] //6024
    AccountUpgradeFailed,
    #[msg("Not implemented")] //6025
    NotImplemented,
    #[msg("Error deserializing position")] //6026
    PositionSerDe,
    #[msg("Position out of bounds")] //6027
    PositionOutOfBounds,
    #[msg("Other")] //6028
    Other,
}
