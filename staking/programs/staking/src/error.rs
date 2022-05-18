use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq)]
pub enum ErrorCode {
    #[msg("Too much exposure to product")]
    TooMuchExposureToProduct,
    #[msg("Too much exposure to governance")]
    TooMuchExposureToGovernance,
    #[msg("Tokens not yet vested")]
    TokensNotYetVested,
    #[msg("Risk limit exceeded")]
    RiskLimitExceeded,
    #[msg("Number of position limit reached")]
    TooManyPositions,
    #[msg("Position not in use")]
    PositionNotInUse,
    #[msg("New position needs to have positive balance")]
    CreatePositionWithZero,
    #[msg("Invalid product/publisher pair")]
    InvalidPosition,
    #[msg("Amount to unlock bigger than position")]
    AmountBiggerThanPosition,
    #[msg("Position already unlocking")]
    AlreadyUnlocking,
    #[msg("Epoch duration is 0")]
    ZeroEpochDuration,
    #[msg("Owner needs to own destination account")]
    WithdrawToUnauthorizedAccount,
    #[msg("Insufficient balance to cover the withdrawal")]
    InsufficientWithdrawableBalance,
    #[msg("Target in position doesn't match target in instruction data")]
    WrongTarget,
    #[msg("An arithmetic operation unexpectedly overflowed")]
    GenericOverflow,
    #[msg("Locked balance must be positive")]
    NegativeBalance,
    #[msg("Protocol is frozen")]
    Frozen,
    #[msg("Not allowed when not debugging")]
    DebuggingOnly,
    #[msg("Voting epoch is either too old or hasn't started")]
    InvalidVotingEpoch,
    #[msg("Voting hasn't started")]
    ProposalNotActive,
    #[msg("Extra governance account required")]
    NoRemainingAccount,
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Error deserializing position")]
    IllegalPositionPod,
    #[msg("Other")]
    Other,
}
