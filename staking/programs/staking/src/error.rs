use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
    #[msg("Insufficient balance to take on a new position")]
    InsufficientBalanceCreatePosition,
    #[msg("Number of position limit reached")]
    TooManyPositions,
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Other")]
    Other,
}