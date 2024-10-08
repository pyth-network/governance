use anchor_lang::error_code;

#[error_code]
pub enum IntegrityPoolError {
    PublisherNotFound,
    PublisherOrRewardAuthorityNeedsToSign,
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
    InvalidPoolDataAccount,
    #[msg("Slashes must be executed in order of slash event index")]
    WrongSlashEventOrder,
    #[msg("Publisher custody account required")]
    PublisherCustodyAccountRequired,
    #[msg("Delegation fee must not be greater than 100%")]
    InvalidDelegationFee,
    InvalidPublisher,
    #[msg("Y should not be greater than 1%")]
    InvalidY,
    InvalidSlashCustodyAccount,
}
