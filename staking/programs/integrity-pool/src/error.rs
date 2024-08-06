use anchor_lang::error_code;

#[error_code]
pub enum IntegrityPoolError {
    PublisherNotFound,
    PublisherNeedsToSign,
    StakeAccountOwnerNeedsToSign,
    OutdatedPublisherAccounting,
    TooManyPublishers,
    UnexpectedPositionState,
    PoolDataAlreadyUpToDate,
    OutdatedPublisherCaps,
    OutdatedDelegatorAccounting,
    CurrentStakeAccountShouldBeUndelegated,
    NewStakeAccountShouldBeUndelegated,
    PublisherStakeAccountMismatch,
    ThisCodeShouldBeUnreachable,
    InsufficientRewards,
    #[msg("Start epoch of the reward program is before the current epoch")]
    InvalidStartEpoch,
    UnverifiedPublisherCaps,
    #[msg("Slash event indexes must be sequential and start at 0")]
    InvalidSlashEventIndex,
    InvalidRewardProgramAuthority,
}
