use {
    crate::{
        state::positions::{
            PositionData,
            PositionState,
            Target,
            MAX_POSITIONS,
        },
        ErrorCode::{
            RiskLimitExceeded,
            TokensNotYetVested,
            TooMuchExposureToGovernance,
            TooMuchExposureToProduct,
        },
    },
    anchor_lang::prelude::*,
    std::{
        cmp,
        collections::BTreeMap,
    },
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
    let mut current_exposures: BTreeMap<Target, u64> = BTreeMap::new();

    for i in 0..MAX_POSITIONS {
        if let Some(position) = stake_account_positions.read_position(i)? {
            match position.get_current_position(current_epoch, unlocking_duration)? {
                PositionState::LOCKED
                | PositionState::PREUNLOCKING
                | PositionState::UNLOCKING
                | PositionState::LOCKING => {
                    let prod_exposure: &mut u64 = current_exposures
                        .entry(position.target_with_parameters.get_target())
                        .or_default();
                    *prod_exposure = prod_exposure.checked_add(position.amount).unwrap();
                }
                _ => {}
            }
        }
    }

    let vested_balance = total_balance
        .checked_sub(unvested_balance)
        .ok_or_else(|| error!(TokensNotYetVested))?;
    /*
     * The four inequalities we need to hold are:
     *      vested balance >= 0
     *      total balance = vested balance + unvested balance >= voting position
     *      vested balance >= exposure_i for each target other than voting
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
    let mut max_target_exposure: u64 = 0;
    let mut total_exposure: u64 = 0;
    for (target, exposure) in &current_exposures {
        match target {
            Target::Voting => {
                // This is the special voting position that ignores vesting
                // If there are multiple voting positions, they've been aggregated at this point
                governance_exposure = *exposure;
            }
            Target::Staking { .. } => {
                // A normal position
                max_target_exposure = cmp::max(max_target_exposure, *exposure);
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
            .checked_sub(max_target_exposure)
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

    Ok(withdrawable_balance)
}

#[cfg(test)]
pub mod tests {
    use {
        crate::{
            state::positions::{
                Position,
                PositionData,
                PositionState,
                Publisher,
                TargetWithParameters,
            },
            utils::risk::validate,
        },
        anchor_lang::prelude::Pubkey,
    };


    #[test]
    fn test_disjoint() {
        let mut pd = PositionData::default();
        // We need at least 7 vested tokens to support these positions
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::Staking {
                    product:   Pubkey::new_unique(),
                    publisher: Publisher::SOME {
                        address: Pubkey::new_unique(),
                    },
                },
                unlocking_start:        Some(50),
            },
        )
        .unwrap();
        pd.write_position(
            1,
            &Position {
                activation_epoch:       1,
                amount:                 3,
                target_with_parameters: TargetWithParameters::Staking {
                    product:   Pubkey::new_unique(),
                    publisher: Publisher::SOME {
                        address: Pubkey::new_unique(),
                    },
                },
                unlocking_start:        Some(50),
            },
        )
        .unwrap();
        let tests = [
            (0, PositionState::LOCKING),
            (44, PositionState::PREUNLOCKING),
            (50, PositionState::UNLOCKING),
        ];
        for (current_epoch, desired_state) in tests {
            assert_eq!(
                pd.read_position(0)
                    .unwrap()
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
        let mut pd = PositionData::default();
        // We need at least 3 vested, 7 total
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::Voting,
                unlocking_start:        None,
            },
        )
        .unwrap();
        pd.write_position(
            1,
            &Position {
                activation_epoch:       1,
                amount:                 3,
                target_with_parameters: TargetWithParameters::Staking {
                    product:   Pubkey::new_unique(),
                    publisher: Publisher::SOME {
                        address: Pubkey::new_unique(),
                    },
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
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
        let mut pd = PositionData::default();
        let product = Pubkey::new_unique();
        // We need at least 10 vested to support these
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::Staking {
                    product,
                    publisher: Publisher::DEFAULT,
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
        pd.write_position(
            1,
            &Position {
                activation_epoch:       1,
                amount:                 3,
                target_with_parameters: TargetWithParameters::Staking {
                    product,
                    publisher: Publisher::DEFAULT,
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 12, 0, current_epoch, 1).unwrap(), 2);
        assert!(validate(&pd, 12, 4, current_epoch, 1).is_err());
        assert!(validate(&pd, 9, 0, current_epoch, 1).is_err());
        assert!(validate(&pd, 20, 11, current_epoch, 1).is_err());
    }
    #[test]
    fn test_risk() {
        let mut pd = PositionData::default();
        for i in 0..5 {
            pd.write_position(
                i,
                &Position {
                    activation_epoch:       1,
                    amount:                 10,
                    target_with_parameters: TargetWithParameters::Staking {
                        product:   Pubkey::new_unique(),
                        publisher: Publisher::SOME {
                            address: Pubkey::new_unique(),
                        },
                    },
                    unlocking_start:        None,
                },
            )
            .unwrap();
        }
        let current_epoch = 44;
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 0);
        // Now we have 6 products, so 10 tokens is not enough
        pd.write_position(
            7,
            &Position {
                activation_epoch:       1,
                amount:                 10,
                target_with_parameters: TargetWithParameters::Staking {
                    product:   Pubkey::new_unique(),
                    publisher: Publisher::SOME {
                        address: Pubkey::new_unique(),
                    },
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
        assert!(validate(&pd, 10, 0, current_epoch, 1).is_err());
        // But 12 should be
        assert_eq!(validate(&pd, 12, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 15, 0, current_epoch, 1).unwrap(), 3);
    }
    #[test]
    fn test_multiple_voting() {
        let mut pd = PositionData::default();
        for i in 0..5 {
            pd.write_position(
                i,
                &Position {
                    activation_epoch:       1,
                    amount:                 10,
                    target_with_parameters: TargetWithParameters::Voting,
                    unlocking_start:        None,
                },
            )
            .unwrap();
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
        let mut pd = PositionData::default();
        for i in 0..5 {
            pd.write_position(
                i,
                &Position {
                    activation_epoch:       1,
                    amount:                 u64::MAX / 3,
                    target_with_parameters: TargetWithParameters::Voting,
                    unlocking_start:        None,
                },
            )
            .unwrap();
        }
        let current_epoch = 44;
        // Overflows in the total exposure computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
    #[should_panic]
    #[test]
    fn test_overflow_aggregation() {
        let mut pd = PositionData::default();
        let product = Pubkey::new_unique();
        for i in 0..5 {
            pd.write_position(
                i,
                &Position {
                    activation_epoch:       1,
                    amount:                 u64::MAX / 3,
                    target_with_parameters: TargetWithParameters::Staking {
                        product,
                        publisher: Publisher::SOME {
                            address: Pubkey::new_unique(),
                        },
                    },
                    unlocking_start:        None,
                },
            )
            .unwrap();
        }
        let current_epoch = 44;
        // Overflows in the aggregation computation
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }
}
