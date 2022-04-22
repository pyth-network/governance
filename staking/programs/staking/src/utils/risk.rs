use anchor_lang::prelude::*;
use std::cmp;
use std::collections::BTreeMap;

use crate::state::positions::{
    PositionData,
    PositionState,
    MAX_POSITIONS,
};
use crate::ErrorCode::{
    RiskLimitExceeded,
    TokensNotYetVested,
    TooMuchExposureToGovernance,
    TooMuchExposureToProduct,
};

/// Validates that a proposed set of positions meets all risk requirements
/// stake_account_positions is untrusted, while everything else is trusted
/// If it passes the risk check, it returns the max amount of vested balance
/// that can be withdrawn without violating risk constraints.
/// It's guaranteed that the returned value is between 0 and vested_balance (both inclusive)
pub fn validate(
    stake_account_positions: &PositionData,
    total_balance: u64,
    unvested_balance: u64,
    current_epoch: u64,
    unlocking_duration: u8,
) -> Result<u64> {
    let mut current_exposures: BTreeMap<Option<Pubkey>, u64> = BTreeMap::new();

    for i in 0..MAX_POSITIONS {
        if stake_account_positions.positions[i].is_some() {
            match stake_account_positions.positions[i]
                .unwrap()
                .get_current_position(current_epoch, unlocking_duration)
                .unwrap()
            {
                PositionState::LOCKED
                | PositionState::PREUNLOCKING
                | PositionState::UNLOCKING
                | PositionState::LOCKING => {
                    let this_position = stake_account_positions.positions[i].unwrap();
                    let prod_exposure: &mut u64 = current_exposures
                        .entry(this_position.stake_target.get_key())
                        .or_default();
                    *prod_exposure = prod_exposure.checked_add(this_position.amount).unwrap();
                }
                _ => {}
            }
        }
    }

    let vested_balance = total_balance
        .checked_sub(unvested_balance)
        .ok_or(error!(TokensNotYetVested))?;
    /*
     * The four inequalities we need to hold are:
     *      vested balance >= 0
     *      total balance = vested balance + unvested balance >= voting position
     *      vested balance >= exposure_i for each product other than voting
     *      RISK_THRESH * vested balance >= sum exposure_i (again excluding voting)
     *
     * If you replace vested balance with (vested balance - withdrawable amount) and then solve
     * for withdrawable amount (w), you get:
     *      w <= vested balance
     *      w <= total balance - voting position
     *      w <= vested balance - exposure_i    (for each i, excluding voting)
     *      RISK_THRESH * w <= RISK_THRESH * vested balance - sum exposure_i  (excluding voting)
     * we want to be careful about rounding in the division for the last inequality,
     * so we use:
     *   w <= floor((RISK_THRESH * vested balance - sum exposure_i)/RISK_THRESH)
     * which implies the actual inequality.
     * The maximum value for w is then just the minimum of all the RHS of all the inequalities.
     */

    let mut governance_exposure: u64 = 0;
    let mut max_product_exposure: u64 = 0;
    let mut total_exposure: u64 = 0;
    for (product, exposure) in &current_exposures {
        match product {
            None => {
                // This is the special voting position that ignores vesting
                // If there are multiple voting positions, they've been aggregated at this point
                governance_exposure = *exposure;
            }
            Some(_) => {
                // A normal position
                max_product_exposure = cmp::max(max_product_exposure, *exposure);
                total_exposure = total_exposure
                    .checked_add(*exposure)
                    .ok_or_else(|| error!(TooMuchExposureToProduct))?;
            }
        }
    }
    // TODO: Actually define how risk works and make this not a constant
    const RISK_THRESH: u64 = 5;

    let mut withdrawable_balance = vested_balance;
    withdrawable_balance = cmp::min(
        withdrawable_balance,
        total_balance
            .checked_sub(governance_exposure)
            .ok_or_else(|| error!(TooMuchExposureToGovernance))?,
    );
    withdrawable_balance = cmp::min(
        withdrawable_balance,
        vested_balance
            .checked_sub(max_product_exposure)
            .ok_or_else(|| error!(TooMuchExposureToProduct))?,
    );
    withdrawable_balance = cmp::min(
        withdrawable_balance,
        vested_balance
            .checked_mul(RISK_THRESH)
            .unwrap()
            .checked_sub(total_exposure)
            .ok_or_else(|| error!(RiskLimitExceeded))?
            .checked_div(RISK_THRESH)
            .unwrap(),
    );

    return Ok(withdrawable_balance);
}

#[cfg(test)]
pub mod tests {
    use anchor_lang::prelude::Pubkey;

    use crate::state::positions::{
        Position,
        PositionData,
        PositionState,
        Publisher,
        StakeTarget,
        MAX_POSITIONS,
        POSITION_DATA_PADDING,
    };
    use crate::utils::risk::validate;

    #[test]
    fn test_disjoint() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        // We need at least 7 vested tokens to support these positions
        pd.positions[0] = Some(Position {
            activation_epoch: 1,
            amount:           7,
            stake_target:     StakeTarget::STAKING {
                _product:   Pubkey::new_unique(),
                _publisher: Publisher::SOME {
                    _address: Pubkey::new_unique(),
                },
            },
            unlocking_start:  Some(50),
            reserved:         POSITION_DATA_PADDING,
        });
        pd.positions[1] = Some(Position {
            activation_epoch: 1,
            amount:           3,
            stake_target:     StakeTarget::STAKING {
                _product:   Pubkey::new_unique(),
                _publisher: Publisher::SOME {
                   _address: Pubkey::new_unique(),
                },
            },
            unlocking_start:  Some(50),
            reserved:         POSITION_DATA_PADDING,
        });
        let tests = [
            (0, PositionState::LOCKING),
            (44, PositionState::PREUNLOCKING),
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
            assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 3); // 10 vested
            assert_eq!(validate(&pd, 7, 0, current_epoch, 1).unwrap(), 0); // 7 vested, the limit
            assert_eq!(validate(&pd, 10, 3, current_epoch, 1).unwrap(), 0); // 7 vested
            assert!(validate(&pd, 6, 0, current_epoch, 1).is_err());
            assert!(validate(&pd, 10, 6, current_epoch, 1).is_err());
        }
    }

    #[test]
    fn test_voting() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        // We need at least 3 vested, 7 total
        pd.positions[0] = Some(Position {
            activation_epoch: 1,
            amount:           7,
            stake_target:     StakeTarget::VOTING,
            unlocking_start:  None,
            reserved:         POSITION_DATA_PADDING,
        });
        pd.positions[4] = Some(Position {
            activation_epoch: 1,
            amount:           3,
            stake_target:     StakeTarget::STAKING {
                _product:   Pubkey::new_unique(),
                _publisher: Publisher::SOME {
                    _address: Pubkey::new_unique(),
                },
            },
            unlocking_start:  None,
            reserved:         POSITION_DATA_PADDING,
        });
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 3);
        assert_eq!(validate(&pd, 7, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 7, 4, current_epoch, 1).unwrap(), 0);
        assert!(validate(&pd, 6, 0, current_epoch, 1).is_err());
        // only 2 vested:
        assert!(validate(&pd, 10, 8, current_epoch, 1).is_err());
    }
    #[test]
    fn test_double_product() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        let product = Pubkey::new_unique();
        // We need at least 10 vested to support these
        pd.positions[0] = Some(Position {
            activation_epoch: 1,
            amount:           7,
            stake_target:     StakeTarget::STAKING {
                _product : product,
                _publisher: Publisher::DEFAULT,
            },
            unlocking_start:  None,
            reserved:         POSITION_DATA_PADDING,
        });
        pd.positions[3] = Some(Position {
            activation_epoch: 1,
            amount:           3,
            stake_target:     StakeTarget::STAKING {
                _product : product,
                _publisher: Publisher::DEFAULT,
            },
            unlocking_start:  None,
            reserved:         POSITION_DATA_PADDING,
        });
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 12, 0, current_epoch, 1).unwrap(), 2);
        assert!(validate(&pd, 12, 4, current_epoch, 1).is_err());
        assert!(validate(&pd, 9, 0, current_epoch, 1).is_err());
        assert!(validate(&pd, 20, 11, current_epoch, 1).is_err());
    }
    #[test]
    fn test_risk() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount:           10,
                stake_target:     StakeTarget::STAKING {
                    _product:   Pubkey::new_unique(),
                    _publisher: Publisher::SOME {
                        _address: Pubkey::new_unique(),
                    },
                },
                unlocking_start:  None,
                reserved:         POSITION_DATA_PADDING,
            });
        }
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 0);
        // Now we have 6 products, so 10 tokens is not enough
        pd.positions[7] = Some(Position {
            activation_epoch: 1,
            amount:           10,
            stake_target:     StakeTarget::STAKING {
                _product:   Pubkey::new_unique(),
                _publisher: Publisher::SOME {
                    _address: Pubkey::new_unique(),
                },
            },
            unlocking_start:  None,
            reserved:         POSITION_DATA_PADDING,
        });
        assert!(validate(&pd, 10, 0, current_epoch, 1).is_err());
        // But 12 should be
        assert_eq!(validate(&pd, 12, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 15, 0, current_epoch, 1).unwrap(), 3);
    }
    #[test]
    fn test_multiple_voting() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount:           10,
                stake_target:     StakeTarget::VOTING,
                unlocking_start:  None,
                reserved:         POSITION_DATA_PADDING,
            });
        }
        let current_epoch = 44;
        assert_eq!(validate(&pd, 100, 0, current_epoch, 1).unwrap(), 50);
        assert_eq!(validate(&pd, 50, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 60, 51, current_epoch, 1).unwrap(), 9);
        assert!(validate(&pd, 49, 0, current_epoch, 1).is_err());
    }

    #[should_panic]
    #[test]
    fn test_overflow_total() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount:           u64::MAX / 3,
                stake_target:     StakeTarget::VOTING,
                unlocking_start:  None,
                reserved:         POSITION_DATA_PADDING,
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
            owner:     Pubkey::new_unique(),
            positions: [None; MAX_POSITIONS],
        };
        let product = Pubkey::new_unique();
        for i in 0..5 {
            pd.positions[i] = Some(Position {
                activation_epoch: 1,
                amount:           u64::MAX / 3,
                stake_target:     StakeTarget::STAKING {
                    _product : product,
                    _publisher: Publisher::SOME {
                        _address: Pubkey::new_unique(),
                    },
                },
                unlocking_start:  None,
                reserved:         POSITION_DATA_PADDING,
            });
        }
        let current_epoch = 44;
        // Overflows in the aggregation computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
}
