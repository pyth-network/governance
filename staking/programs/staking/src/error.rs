use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
    #[msg("Other")]
    Other,
}