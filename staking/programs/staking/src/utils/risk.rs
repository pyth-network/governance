use anchor_lang::prelude::*;
use std::collections::BTreeMap;

use crate::state::positions::{PositionData, PositionState, MAX_POSITIONS};
use crate::ErrorCode::{InsufficientBalanceCreatePosition, RiskLimitExceeded};

/// Validates that a proposed set of positions meets all risk requirements
/// stake_account_positions is untrusted, while everything else is trusted
pub fn validate(
    stake_account_positions: &PositionData,
    total_balance: u64,
    unvested_balance: u64,
    current_epoch: u64,
    unlocking_duration: u8,
) -> Result<()> {
    let mut current_exposures: BTreeMap<Option<Pubkey>, u64> = BTreeMap::new();

    for i in 0..MAX_POSITIONS {
        if stake_account_positions.positions[i].is_some() {
            match stake_account_positions.positions[i]
                .unwrap()
                .get_current_position(current_epoch, unlocking_duration)
                .unwrap()
            {
                PositionState::LOCKED | PositionState::UNLOCKING | PositionState::LOCKING => {
                    let this_position = stake_account_positions.positions[i].unwrap();
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
        match *product {
            None => {
                // This is the special voting position that ignores vesting
                if *exposure > total_balance {
                    return Err(error!(InsufficientBalanceCreatePosition));
                }
            }
            Some(_) => {
                // A normal position
                if *exposure > vested_balance {
                    return Err(error!(InsufficientBalanceCreatePosition));
                }
                total_exposure = total_exposure.checked_add(*exposure).unwrap();
            }
        }
    }
    // TODO: Actually define how risk works and make this not a constant
    const RISK_THRESH: u64 = 5;
    if total_exposure > RISK_THRESH * vested_balance {
        return Err(error!(RiskLimitExceeded));
    }

    return Ok(());
}

#[cfg(test)]
pub mod tests {
    use anchor_lang::prelude::{error, Pubkey};

    use crate::state::positions::{PositionState};
    use crate::ErrorCode::{InsufficientBalanceCreatePosition, RiskLimitExceeded};
    use crate::{
        state::positions::{Position, PositionData, MAX_POSITIONS},
        utils::risk::validate,
    };

    #[test]
    fn test_disjoint() {
        let mut pd = PositionData {
            positions: [None; MAX_POSITIONS],
        };
        // We need at least 7 vested tokens to support these positions
        pd.positions[0] = Some(Position {
            activation_epoch: 1,
            amount: 7,
            product: Some(Pubkey::new_unique()),
            publisher: Some(Pubkey::new_unique()),
            unlocking_start: Some(50),
        });
        pd.positions[1] = Some(Position {
            activation_epoch: 1,
            amount: 3,
            product: Some(Pubkey::new_unique()),
            publisher: Some(Pubkey::new_unique()),
            unlocking_start: Some(50),
        });
        let tests = [
            (0, PositionState::LOCKING),
            (44, PositionState::LOCKED),
            (50, PositionState::UNLOCKING),
        ];
        for (current_epoch, desired_state) in tests {
            assert_eq!(
                pd.positions[0]
                    .unwrap()
                    .get_current_position(current_epoch, 1)
                    .unwrap(),
                desired_state
            );
            assert!(validate(&pd, 10, 0, current_epoch, 1).is_ok()); // 10 vested
            assert!(validate(&pd, 7, 0, current_epoch, 1).is_ok()); // 7 vested, the limit
            assert!(validate(&pd, 10, 3, current_epoch, 1).is_ok()); // 7 vested
            assert!(validate(&pd, 6, 0, current_epoch, 1).is_err());
            assert!(validate(&pd, 10, 6, current_epoch, 1).is_err());
        }
    }

    #[test]
    fn test_voting() {
        let mut pd = PositionData {
            positions: [None; MAX_POSITIONS],
        };
        // We need at least 3 vested, 7 total
        pd.positions[0] = Some(Position {
            activation_epoch: 1,
            amount: 7,
            product: None,
            publisher: None,
            unlocking_start: None,
        });
        pd.positions[4] = Some(Position {
            activation_epoch: 1,
            amount: 3,
            product: Some(Pubkey::new_unique()),
            publisher: Some(Pubkey::new_unique()),
            unlocking_start: None,
        });
        let current_epoch = 44;
        assert!(validate(&pd, 10, 0, current_epoch, 1).is_ok());
        assert!(validate(&pd, 7, 0, current_epoch, 1).is_ok());
        assert!(validate(&pd, 7, 4, current_epoch, 1).is_ok());
        assert!(validate(&pd, 6, 0, current_epoch, 1).is_err());
        // only 2 vested:
        assert!(validate(&pd, 10, 8, current_epoch, 1).is_err());
    }
    #[test]
    fn test_double_product() {
        let mut pd = PositionData {
            positions: [None; MAX_POSITIONS],
        };
        let product = Pubkey::new_unique();
        // We need at least 10 vested to support these
        pd.positions[0] = Some(Position {
            activation_epoch: 1,
            amount: 7,
            product: Some(product),
            publisher: None,
            unlocking_start: None,
        });
        pd.positions[3] = Some(Position {
            activation_epoch: 1,
            amount: 3,
            product: Some(product),
            publisher: None,
            unlocking_start: None,
        });
        let current_epoch = 44;
        assert!(validate(&pd, 10, 0, current_epoch, 1).is_ok());
        assert!(validate(&pd, 12, 0, current_epoch, 1).is_ok());
        assert!(validate(&pd, 12, 4, current_epoch, 1).is_err());
        assert!(validate(&pd, 9, 0, current_epoch, 1).is_err());
        assert!(validate(&pd, 20, 11, current_epoch, 1).is_err());
    }
    #[test]
    fn test_risk() {
        let mut pd = PositionData {
            positions: [None; MAX_POSITIONS],
        };
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount: 10,
                product: Some(Pubkey::new_unique()),
                publisher: Some(Pubkey::new_unique()),
                unlocking_start: None,
            });
        }
        let current_epoch = 44;
        assert!(validate(&pd, 10, 0, current_epoch, 1).is_ok());
        // Now we have 6 products, so 10 tokens is not enough
        pd.positions[7] = Some(Position {
            activation_epoch: 1,
            amount: 10,
            product: Some(Pubkey::new_unique()),
            publisher: Some(Pubkey::new_unique()),
            unlocking_start: None,
        });
        assert!(validate(&pd, 10, 0, current_epoch, 1).is_err());
        // But 12 should be
        assert!(validate(&pd, 12, 0, current_epoch, 1).is_ok());
    }

    #[should_panic]
    #[test]
    fn test_overflow_total() {
        let mut pd = PositionData {
            positions: [None; MAX_POSITIONS],
        };
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount: u64::MAX / 3,
                product: None,
                publisher: None,
                unlocking_start: None,
            });
        }
        let current_epoch = 44;
        // Overflows in the total exposure computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
    #[should_panic]
    #[test]
    fn test_overflow_aggregation() {
        let mut pd = PositionData {
            positions: [None; MAX_POSITIONS],
        };
        let product = Pubkey::new_unique();
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount: u64::MAX / 3,
                product: Some(product),
                publisher: Some(Pubkey::new_unique()),
                unlocking_start: None,
            });
        }
        let current_epoch = 44;
        // Overflows in the aggregation computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
}
