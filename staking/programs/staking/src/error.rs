use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq, Eq)]
pub enum ErrorCode {
    #[msg("Too much exposure to integrity pool")] //6000
    TooMuchExposureToIntegrityPool,
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
    #[msg("Can't vote during an account's transfer epoch")] //6028
    VoteDuringTransferEpoch,
    #[msg("You need to be an LLC member to perform this action")] //6029
    NotLlcMember,
    #[msg("Invalid LLC agreement")] // 6030
    InvalidLlcAgreement,
    #[msg("Can't split 0 tokens from an account")] // 6031
    SplitZeroTokens,
    #[msg("Can't split more tokens than are in the account")] // 6032
    SplitTooManyTokens,
    #[msg("Can't split a token account with staking positions. Unstake your tokens first.")]
    // 6033
    SplitWithStake,
    #[msg("The approval arguments do not match the split request.")] // 6034
    InvalidApproval,
    #[msg("Can't recover account with staking positions. Unstake your tokens first.")] // 6035
    RecoverWithStake,
    #[msg("The pool authority hasn't been passed or doesn't match the target")] // 6036
    InvalidPoolAuthority,
    #[msg("The slash ratio should be between 0 and 1")] // 6037
    InvalidSlashRatio,
    #[msg("The target account is missing")] // 6038
    MissingTargetAccount,
    #[msg("Other")] //6038
    Other,
}
