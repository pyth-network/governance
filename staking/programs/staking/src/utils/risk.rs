use {
    crate::{
        state::positions::{
            DynamicPositionArray,
            Target,
        },
        ErrorCode::{
            TokensNotYetVested,
            TooMuchExposureToGovernance,
            TooMuchExposureToIntegrityPool,
        },
    },
    anchor_lang::prelude::*,
    std::cmp,
};

/// Validates that a proposed set of positions meets all risk requirements
/// stake_account_positions is untrusted, while everything else is trusted
/// If it passes the risk check, it returns the max amount of vested balance
/// that can be withdrawn without violating risk constraints.
/// It's guaranteed that the returned value is between 0 and vested_balance (both inclusive)
pub fn validate(
    stake_account_positions: &DynamicPositionArray,
    total_balance: u64,
    unvested_balance: u64,
    current_epoch: u64,
    unlocking_duration: u8,
) -> Result<u64> {
    let governance_exposure: u64 = stake_account_positions.get_target_exposure(
        &Target::Voting,
        current_epoch,
        unlocking_duration,
    )?;
    let integrity_pool_exposure: u64 = stake_account_positions.get_target_exposure(
        &Target::IntegrityPool,
        current_epoch,
        unlocking_duration,
    )?;

    let vested_balance = total_balance
        .checked_sub(unvested_balance)
        .ok_or_else(|| error!(TokensNotYetVested))?;
    /*
     * The three inequalities we need to hold are:
     *      vested balance >= 0
     *      total balance = vested balance + unvested balance >= governance_exposure
     *       vested balance >= integrity_pool_exposure
     *
     * If you replace vested balance with (vested balance - withdrawable amount) and then solve
     * for withdrawable amount (w), you get:
     *      w <= vested balance
     *      w <= total balance - voting position
     *      w <= vested balance - integrity_pool_exposure
     * The maximum value for w is then just the minimum of all the RHS of all the inequalities.
     */
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
            .checked_sub(integrity_pool_exposure)
            .ok_or_else(|| error!(TooMuchExposureToIntegrityPool))?,
    );

    Ok(withdrawable_balance)
}

#[cfg(test)]
pub mod tests {
    use {
        crate::{
            state::positions::{
                DynamicPositionArrayAccount,
                Position,
                PositionState,
                TargetWithParameters,
            },
            utils::risk::validate,
        },
        anchor_lang::prelude::Pubkey,
    };


    #[test]
    fn test_disjoint() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        // We need at least 10 vested tokens to support these positions
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
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
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
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
            assert_eq!(validate(&pd, 15, 0, current_epoch, 1).unwrap(), 5); // 10 staked
            assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 0); // 10 staked, the limit
            assert_eq!(validate(&pd, 13, 3, current_epoch, 1).unwrap(), 0); // 3 locked, 10 staked
            assert!(validate(&pd, 9, 0, current_epoch, 1).is_err()); // 9 tokens but needs 10 staked, should fail
            assert!(validate(&pd, 13, 4, current_epoch, 1).is_err()); // 4 locked, 9 unlocked but
                                                                      // needs 10 for staking,
                                                                      // should fail
        }

        let (current_epoch, desired_state) = (51u64, PositionState::UNLOCKED);
        assert_eq!(
            pd.read_position(0)
                .unwrap()
                .unwrap()
                .get_current_position(current_epoch, 1)
                .unwrap(),
            desired_state
        );
        assert_eq!(validate(&pd, 15, 0, current_epoch, 1).unwrap(), 15);
        assert_eq!(validate(&pd, 10, 0, current_epoch, 1).unwrap(), 10);
        assert_eq!(validate(&pd, 13, 3, current_epoch, 1).unwrap(), 10);
        assert_eq!(validate(&pd, 9, 0, current_epoch, 1).unwrap(), 9);
        assert_eq!(validate(&pd, 13, 4, current_epoch, 1).unwrap(), 9);
    }

    #[test]
    fn test_voting() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
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
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
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
    fn test_double_integrity_pool() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        // We need at least 10 vested to support these
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
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
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
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
    fn test_multiple_integrity_pool() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        for i in 0..5 {
            pd.write_position(
                i,
                &Position {
                    activation_epoch:       1,
                    amount:                 10,
                    target_with_parameters: TargetWithParameters::IntegrityPool {
                        publisher: Pubkey::new_unique(),
                    },
                    unlocking_start:        None,
                },
            )
            .unwrap();
        }
        let current_epoch = 44;
        assert_eq!(validate(&pd, 50, 0, current_epoch, 1).unwrap(), 0);
        // Now we have 6 integrity pool positions, so 50 tokens is not enough
        pd.write_position(
            7,
            &Position {
                activation_epoch:       1,
                amount:                 10,
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
        assert!(validate(&pd, 50, 0, current_epoch, 1).is_err());
        // But 60 should be
        assert_eq!(validate(&pd, 60, 0, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 65, 0, current_epoch, 1).unwrap(), 5);
    }
    #[test]
    fn test_multiple_voting() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
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

    #[test]
    fn test_overflow_total() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
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
        // Overflows in the total governance computation
        let current_epoch = 44;
        assert!(validate(&pd, u64::MAX, 0, current_epoch, 1).is_err());
    }

    #[test]
    fn test_overflow_aggregation() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        for i in 0..5 {
            pd.write_position(
                i,
                &Position {
                    activation_epoch:       1,
                    amount:                 u64::MAX / 3,
                    target_with_parameters: TargetWithParameters::IntegrityPool {
                        publisher: Pubkey::new_unique(),
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

    #[test]
    fn test_multiple_voting_and_integrity_pool() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        let current_epoch = 1;
        // We need at least 4 vested, 10 total
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 2,
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
        pd.write_position(
            1,
            &Position {
                activation_epoch:       1,
                amount:                 2,
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
                },
                unlocking_start:        None,
            },
        )
        .unwrap();
        pd.write_position(
            2,
            &Position {
                activation_epoch:       1,
                amount:                 3,
                target_with_parameters: TargetWithParameters::Voting,
                unlocking_start:        None,
            },
        )
        .unwrap();
        pd.write_position(
            3,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::Voting,
                unlocking_start:        None,
            },
        )
        .unwrap();

        assert_eq!(validate(&pd, 10, 6, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 10, 4, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 11, 7, current_epoch, 1).unwrap(), 0);
        assert_eq!(validate(&pd, 11, 6, current_epoch, 1).unwrap(), 1);
        assert!(validate(&pd, 10, 7, current_epoch, 1).is_err()); // breaks the integrity pool inequality
        assert!(validate(&pd, 4, 0, current_epoch, 1).is_err()); // breaks the voting inequality
    }
}
