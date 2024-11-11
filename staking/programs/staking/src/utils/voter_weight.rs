use {
    crate::{
        error::ErrorCode,
        state::positions::{
            DynamicPositionArray,
            PositionState,
        },
    },
    anchor_lang::prelude::*,
    std::convert::TryInto,
};

pub fn compute_voter_weight(
    stake_account_positions: &DynamicPositionArray,
    current_epoch: u64,
    current_locked: u64,
    total_supply: u64,
) -> Result<u64> {
    let mut raw_voter_weight = 0u64;
    for i in 0..stake_account_positions.get_position_capacity() {
        if let Some(position) = stake_account_positions.read_position(i)? {
            match position.get_current_position(current_epoch)? {
                PositionState::LOCKED | PositionState::PREUNLOCKING => {
                    if position.is_voting() {
                        // position.amount is trusted, so I don't think this can overflow,
                        // but still probably better to use checked math
                        raw_voter_weight = raw_voter_weight + position.amount;
                    }
                }
                _ => {}
            }
        }
    }
    let voter_weight: u64 = ((u128::from(raw_voter_weight)) * (u128::from(total_supply)))
        .checked_div(u128::from(current_locked))
        .unwrap_or(0_u128)
        .try_into()
        .map_err(|_| ErrorCode::GenericOverflow)?;
    Ok(voter_weight)
}

#[cfg(test)]
pub mod tests {
    use {
        crate::{
            state::positions::{
                DynamicPositionArrayAccount,
                Position,
                TargetWithParameters,
            },
            utils::voter_weight::compute_voter_weight,
        },
        anchor_lang::prelude::Pubkey,
    };


    #[test]
    fn test_compute_voter_weight() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 7,
                target_with_parameters: TargetWithParameters::Voting {},
                unlocking_start:        Some(3),
            },
        )
        .unwrap();

        pd.write_position(
            1,
            &Position {
                activation_epoch:       3,
                amount:                 3,
                target_with_parameters: TargetWithParameters::Voting {},
                unlocking_start:        None,
            },
        )
        .unwrap();

        pd.write_position(
            2,
            &Position {
                activation_epoch:       2,
                amount:                 5,
                target_with_parameters: TargetWithParameters::Voting {},
                unlocking_start:        Some(4),
            },
        )
        .unwrap();
        pd.write_position(
            3,
            &Position {
                activation_epoch:       0,
                amount:                 10,
                target_with_parameters: TargetWithParameters::IntegrityPool {
                    publisher: Pubkey::new_unique(),
                },
                unlocking_start:        None,
            },
        )
        .unwrap();

        let weight = compute_voter_weight(&pd, 0, 100, 150).unwrap();
        assert_eq!(weight, 0);

        let weight = compute_voter_weight(&pd, 1, 100, 150).unwrap();
        assert_eq!(weight, 7 * 150 / 100);

        let weight = compute_voter_weight(&pd, 2, 100, 150).unwrap();
        assert_eq!(weight, 12 * 150 / 100);

        let weight = compute_voter_weight(&pd, 3, 100, 150).unwrap();
        assert_eq!(weight, 8 * 150 / 100);

        let weight = compute_voter_weight(&pd, 4, 100, 150).unwrap();
        assert_eq!(weight, 3 * 150 / 100);
    }

    #[test]
    fn test_overflow() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 u64::MAX / 2,
                target_with_parameters: TargetWithParameters::Voting {},
                unlocking_start:        Some(3),
            },
        )
        .unwrap();

        let weight = compute_voter_weight(&pd, 1, u64::MAX / 2, u64::MAX).unwrap();
        assert_eq!(weight, u64::MAX);
    }

    #[test]
    fn test_locked_amount_zero() {
        let mut fixture = DynamicPositionArrayAccount::default();
        let mut pd = fixture.to_dynamic_position_array();
        pd.write_position(
            0,
            &Position {
                activation_epoch:       1,
                amount:                 u64::MAX / 2,
                target_with_parameters: TargetWithParameters::Voting {},
                unlocking_start:        Some(3),
            },
        )
        .unwrap();

        let weight = compute_voter_weight(&pd, 1, 0, u64::MAX).unwrap();
        assert_eq!(weight, 0);
    }
}
