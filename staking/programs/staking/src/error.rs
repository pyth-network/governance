use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
    #[msg("Not implemented")]
    NotImplemented,
    #[msg("Other")]
    Other,
}