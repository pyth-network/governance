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
    #[msg("Epoch duration is 0")]
    ZeroEpochDuration,
    #[msg("Owner needs to own destination account")]
    WithdrawToUnathorizedAccount,
    #[msg("Insufficient balance to cover the withdrawal")]
    InsufficientWithdrawableBalance,
    #[msg("Not allowed when not debugging")]
    DebuggingOnly,
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Other")]
    Other,
}