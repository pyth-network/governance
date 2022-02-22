use anchor_lang::prelude::{ProgramResult, Pubkey};
use std::collections::BTreeMap;

use crate::state::positions::{PositionData, PositionState, MAX_POSITIONS, VOTING_POSITION};
use crate::ErrorCode::{InsufficientBalanceCreatePosition, RiskLimitExceeded};

/// Validates that a proposed set of positions meets all risk requirements
/// stake_account_positions is untrusted, while everything else is trusted
pub fn validate(
    stake_account_positions: &PositionData,
    total_balance: u64,
    unvested_balance: u64,
    current_epoch: u64,
    unlocking_duration: u8,
) -> ProgramResult {
    let mut current_exposures: BTreeMap<Pubkey, u64> = BTreeMap::new();

    for i in 0..MAX_POSITIONS {
        if stake_account_positions.positions[i].in_use {
            match stake_account_positions.positions[i]
                .get_current_position(current_epoch, unlocking_duration)
                .unwrap()
            {
                PositionState::LOCKED | PositionState::UNLOCKING | PositionState::LOCKING => {
                    let this_position = &stake_account_positions.positions[i];
                    let prod_exposure: &mut u64 =
                        current_exposures.entry(this_position.product).or_default();
                    *prod_exposure = prod_exposure.checked_add(this_position.amount).unwrap();
                }
                _ => {}
            }
        }
    }
    let vested_balance = total_balance - unvested_balance;
    let mut total_exposure: u64 = 0;
    for (product, exposure) in &current_exposures {
        if *product == VOTING_POSITION {
            // This is the special voting position that ignores vesting
            if *exposure > total_balance {
                return Err(InsufficientBalanceCreatePosition.into());
            }
        } else {
            // A normal position
            if *exposure > vested_balance {
                return Err(InsufficientBalanceCreatePosition.into());
            }
            total_exposure = total_exposure.checked_add(*exposure).unwrap();
        }
    }
    // TODO: Actually define how risk works and make this not a constant
    const RISK_THRESH: u64 = 5;
    if total_exposure > RISK_THRESH * vested_balance {
        return Err(RiskLimitExceeded.into());
    }

    return Ok(());
}

#[cfg(test)]
pub mod tests {
    use anchor_lang::prelude::Pubkey;

    use crate::state::positions::{PositionState, VOTING_POSITION};
    use crate::ErrorCode::{InsufficientBalanceCreatePosition,RiskLimitExceeded};
    use crate::{
        state::positions::{PositionData, Position},
        utils::risk::validate,
    };
    use crate::utils::clock::u64;

    #[test]
    fn test_disjoint() {
        let mut pd = PositionData {
            positions: [Position::default(); 100],
        };
        // We need at least 7 vested tokens to support these positions
        pd.positions[0] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 7,
            product: Pubkey::new_unique(),
            publisher: Pubkey::new_unique(),
            unlocking_start: 50,
        };
        pd.positions[1] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 3,
            product: Pubkey::new_unique(),
            publisher: Pubkey::new_unique(),
            unlocking_start: 50,
        };
        let tests = [
            (0, PositionState::LOCKING),
            (44, PositionState::LOCKED),
            (50, PositionState::UNLOCKING),
        ];
        for (current_epoch, desired_state) in tests {
            assert_eq!(
                pd.positions[0]
                    .get_current_position(current_epoch, 1)
                    .unwrap(),
                desired_state
            );
            assert_eq!(validate(&pd, 10, 0, current_epoch, 1), Ok(())); // 10 vested
            assert_eq!(validate(&pd, 7, 0, current_epoch, 1), Ok(())); // 7 vested, the limit
            assert_eq!(validate(&pd, 10, 3, current_epoch, 1), Ok(())); // 7 vested
            assert_eq!(
                validate(&pd, 6, 0, current_epoch, 1),
                Err(InsufficientBalanceCreatePosition.into())
            );
            assert_eq!(
                validate(&pd, 10, 6, current_epoch, 1),
                Err(InsufficientBalanceCreatePosition.into())
            );
        }
    }

    #[test]
    fn test_voting() {
        let mut pd = PositionData {
            positions: [Position::default(); 100],
        };
        // We need at least 3 vested, 7 total
        pd.positions[0] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 7,
            product: VOTING_POSITION,
            publisher: VOTING_POSITION,
            unlocking_start: u64::MAX,
        };
        pd.positions[4] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 3,
            product: Pubkey::new_unique(),
            publisher: Pubkey::new_unique(),
            unlocking_start: u64::MAX,
        };
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1), Ok(()));
        assert_eq!(validate(&pd, 7, 0, current_epoch, 1), Ok(()));
        assert_eq!(validate(&pd, 7, 4, current_epoch, 1), Ok(()));
        assert_eq!(
            validate(&pd, 6, 0, current_epoch, 1),
            Err(InsufficientBalanceCreatePosition.into())
        );
        // only 2 vested:
        assert_eq!(
            validate(&pd, 10, 8, current_epoch, 1),
            Err(InsufficientBalanceCreatePosition.into())
        );
    }
    #[test]
    fn test_double_product() {
        let mut pd = PositionData {
            positions: [Position::default(); 100],
        };
        let product = Pubkey::new_unique();
        // We need at least 10 vested to support these
        pd.positions[0] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 7,
            product: product,
            publisher: Pubkey::new_unique(),
            unlocking_start: u64::MAX,
        };
        pd.positions[3] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 3,
            product: product,
            publisher: Pubkey::new_unique(),
            unlocking_start: u64::MAX,
        };
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1), Ok(()));
        assert_eq!(validate(&pd, 12, 0, current_epoch, 1), Ok(()));
        assert_eq!(
            validate(&pd, 12, 4, current_epoch, 1),
            Err(InsufficientBalanceCreatePosition.into())
        );
        assert_eq!(
            validate(&pd, 9, 0, current_epoch, 1),
            Err(InsufficientBalanceCreatePosition.into())
        );
        assert_eq!(
            validate(&pd, 20, 11, current_epoch, 1),
            Err(InsufficientBalanceCreatePosition.into())
        );
    }
    #[test]
    fn test_risk() {
        let mut pd = PositionData {
            positions: [Position::default(); 100],
        };
        for i in 0..5 {
            pd.positions[i] = Position {
                in_use: true,
                activation_epoch: 1,
                amount: 10,
                product: Pubkey::new_unique(),
                publisher: Pubkey::new_unique(),
                unlocking_start: u64::MAX,
            };
        }
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1), Ok(()));
        // Now we have 6 products, so 10 tokens is not enough
        pd.positions[7] = Position {
            in_use: true,
            activation_epoch: 1,
            amount: 10,
            product: Pubkey::new_unique(),
            publisher: Pubkey::new_unique(),
            unlocking_start: u64::MAX,
        };
        assert_eq!(
            validate(&pd, 10, 0, current_epoch, 1),
            Err(RiskLimitExceeded.into())
        );
        // But 12 should be
        assert_eq!(validate(&pd, 12, 0, current_epoch, 1), Ok(()));
    }

    #[should_panic]
    #[test]
    fn test_overflow_total() {
        let mut pd = PositionData {
            positions: [Position::default(); 100],
        };
        for i in 0..5 {
            pd.positions[i] = Position {
                in_use: true,
                activation_epoch: 1,
                amount: u64::MAX / 3,
                product: Pubkey::new_unique(),
                publisher: Pubkey::new_unique(),
                unlocking_start: u64::MAX,
            };
        }
        let current_epoch = 44;
        // Overflows in the total exposure computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
    #[should_panic]
    #[test]
    fn test_overflow_aggregation() {
        let mut pd = PositionData {
            positions: [Position::default(); 100],
        };
        let product = Pubkey::new_unique();
        for i in 0..5 {
            pd.positions[i] = Position {
                in_use: true,
                activation_epoch: 1,
                amount: u64::MAX / 3,
                product: product,
                publisher: Pubkey::new_unique(),
                unlocking_start: u64::MAX,
            };
        }
        let current_epoch = 44;
        // Overflows in the aggregation computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
}
