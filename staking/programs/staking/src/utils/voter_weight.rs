use crate::error::ErrorCode;
use crate::state::positions::{
    Position,
    PositionData,
    PositionState,
    MAX_POSITIONS,
};
use anchor_lang::prelude::*;
use std::convert::TryInto;

pub fn compute_voter_weight(
    stake_account_positions: &PositionData,
    current_epoch: u64,
    unlocking_duration: u8,
    current_locked: u64,
    total_supply: u64,
) -> Result<u64> {
    let mut raw_voter_weight = 0u64;
    for i in 0..MAX_POSITIONS {
        if let Some(position) =
            TryInto::<Option<Position>>::try_into(stake_account_positions.positions[i]).unwrap()
        {
            match position.get_current_position(current_epoch, unlocking_duration)? {
                PositionState::LOCKED | PositionState::PREUNLOCKING => {
                    if position.is_voting() {
                        // position.amount is trusted, so I don't think this can overflow,
                        // but still probably better to use checked math
                        raw_voter_weight = raw_voter_weight.checked_add(position.amount).unwrap();
                    }
                }
                _ => {}
            }
        }
    }
    let voter_weight: u64 = ((raw_voter_weight as u128) * (total_supply as u128))
        .checked_div(current_locked as u128)
        .unwrap_or(0_u128)
        .try_into()
        .map_err(|_| ErrorCode::GenericOverflow)?;
    Ok(voter_weight)
}

#[cfg(test)]
pub mod tests {
    use crate::state::positions::{
        Position,
        PositionData,
        Publisher,
        TargetWithParameters,
        MAX_POSITIONS,
        POSITION_DATA_PADDING,
    };
    use crate::utils::voter_weight::compute_voter_weight;
    use anchor_lang::prelude::Pubkey;
    use std::convert::TryInto;

    #[test]
    fn test_compute_voter_weight() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None.try_into().unwrap(); MAX_POSITIONS],
        };

        pd.positions[0] = Some(Position {
            activation_epoch:       1,
            amount:                 7,
            target_with_parameters: TargetWithParameters::VOTING {},
            unlocking_start:        Some(3),
        })
        .try_into()
        .unwrap();
        pd.positions[1] = Some(Position {
            activation_epoch:       3,
            amount:                 3,
            target_with_parameters: TargetWithParameters::VOTING {},
            unlocking_start:        None,
        })
        .try_into()
        .unwrap();
        pd.positions[2] = Some(Position {
            activation_epoch:       2,
            amount:                 5,
            target_with_parameters: TargetWithParameters::VOTING {},
            unlocking_start:        Some(4),
        })
        .try_into()
        .unwrap();
        pd.positions[3] = Some(Position {
            activation_epoch:       0,
            amount:                 10,
            target_with_parameters: TargetWithParameters::STAKING {
                product:   Pubkey::new_unique(),
                publisher: Publisher::DEFAULT,
            },
            unlocking_start:        None,
        })
        .try_into()
        .unwrap();

        let weight = compute_voter_weight(&pd, 0, 1, 100, 150).unwrap();
        assert_eq!(weight, 0);

        let weight = compute_voter_weight(&pd, 1, 1, 100, 150).unwrap();
        assert_eq!(weight, 7 * 150 / 100);

        let weight = compute_voter_weight(&pd, 2, 1, 100, 150).unwrap();
        assert_eq!(weight, 12 * 150 / 100);

        let weight = compute_voter_weight(&pd, 3, 1, 100, 150).unwrap();
        assert_eq!(weight, 8 * 150 / 100);

        let weight = compute_voter_weight(&pd, 4, 1, 100, 150).unwrap();
        assert_eq!(weight, 3 * 150 / 100);
    }

    #[test]
    fn test_overflow() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None.try_into().unwrap(); MAX_POSITIONS],
        };

        pd.positions[0] = Some(Position {
            activation_epoch:       1,
            amount:                 u64::MAX / 2,
            target_with_parameters: TargetWithParameters::VOTING {},
            unlocking_start:        Some(3),
        })
        .try_into()
        .unwrap();

        let weight = compute_voter_weight(&pd, 1, 1, u64::MAX / 2, u64::MAX).unwrap();
        assert_eq!(weight, u64::MAX);
    }

    #[test]
    fn test_locked_amount_zero() {
        let mut pd = PositionData {
            owner:     Pubkey::new_unique(),
            positions: [None.try_into().unwrap(); MAX_POSITIONS],
        };

        pd.positions[0] = Some(Position {
            activation_epoch:       1,
            amount:                 u64::MAX / 2,
            target_with_parameters: TargetWithParameters::VOTING {},
            unlocking_start:        Some(3),
        })
        .try_into()
        .unwrap();

        let weight = compute_voter_weight(&pd, 1, 1, 0, u64::MAX).unwrap();
        assert_eq!(weight, 0);
    }
}
