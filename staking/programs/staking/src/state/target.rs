use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use std::convert::TryInto;

pub const TARGET_METADATA_SIZE: usize = 10240;

/// This represents a target that users can stake to
/// Currently we store the last time the target account was updated, the current locked balance
/// and the amount by which the locked balance will change in the next epoch
#[account]
#[derive(Default)]
pub struct TargetMetadata {
    pub bump:           u8,
    pub last_update_at: u64,
    pub locked:         u64,
    pub delta_locked:   i64, // locked = locked + delta_locked for the next epoch
}

impl TargetMetadata {
    // Updates the TargetMedata struct.
    // If no time has passed, doesn't do anything
    // If 1 epoch has passed, locked becomes locked + delta_locked
    // If more than 1 epoch has passed, we can assume that no tokens
    // were locked or unlocked in the epochs between the last update and now
    // (otherwise update would've been called already)
    // therefore the logic is the same as the case where 1 epoch has passed
    pub fn update(&mut self, current_epoch: u64) -> Result<()> {
        let n: u64 = current_epoch
            .checked_sub(self.last_update_at)
            .ok_or(error!(ErrorCode::GenericOverflow))?;
        self.last_update_at = current_epoch;
        match n {
            0 => Ok(()),
            _ => {
                self.locked = (TryInto::<i64>::try_into(self.locked)
                    .or(Err(ErrorCode::GenericOverflow))?)
                .checked_add(self.delta_locked)
                .ok_or(error!(ErrorCode::GenericOverflow))?
                .try_into()
                .or(Err(ErrorCode::NegativeBalance))?;
                self.delta_locked = 0;
                Ok(())
            }
        }
    }

    // Updates the aggregate account if it is outdated (current_epoch > last_updated_at) and
    // subtracts amount to delta_locked. This method needs to be called everytime a user requests to
    // create a new position.
    pub fn add_locking(&mut self, amount: u64, current_epoch: u64) -> Result<()> {
        self.update(current_epoch)?;

        self.delta_locked = self
            .delta_locked
            .checked_add(amount.try_into().or(Err(ErrorCode::GenericOverflow))?)
            .ok_or(error!(ErrorCode::GenericOverflow))?;
        Ok(())
    }

    // Updates the aggregate account if it is outdated (current_epoch > last_updated_at) and
    // subtracts amount to delta_locked. This method needs to be called everytime a user request to
    // unlock a position.
    pub fn add_unlocking(&mut self, amount: u64, current_epoch: u64) -> Result<()> {
        self.update(current_epoch)?;

        self.delta_locked = self
            .delta_locked
            .checked_sub(amount.try_into().or(Err(ErrorCode::GenericOverflow))?)
            .ok_or(error!(ErrorCode::GenericOverflow))?;

        // Locked + delta_locked should never be negative, because that'd mean the balance staked to
        // the target is negative
        if (TryInto::<i64>::try_into(self.locked).or(Err(ErrorCode::GenericOverflow))?)
            .checked_add(self.delta_locked)
            .ok_or(error!(ErrorCode::GenericOverflow))?
            < 0
        {
            return Err(error!(ErrorCode::NegativeBalance));
        }
        Ok(())
    }
}

#[cfg(test)]
pub mod tests {
    use crate::state::target::TargetMetadata;
    #[test]
    fn zero_update() {
        let target = &mut TargetMetadata {
            bump:           0,
            last_update_at: 0,
            locked:         0,
            delta_locked:   0,
        };

        assert!(target.update(target.last_update_at + 10).is_ok());
        assert_eq!(target.last_update_at, 10);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 0);
    }

    #[test]
    fn positive_update() {
        let target = &mut TargetMetadata {
            bump:           0,
            last_update_at: 0,
            locked:         0,
            delta_locked:   0,
        };

        assert!(target.add_locking(10, target.last_update_at).is_ok());
        assert_eq!(target.last_update_at, 0);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 10);

        assert!(target.update(target.last_update_at + 1).is_ok());

        assert_eq!(target.last_update_at, 1);
        assert_eq!(target.locked, 10);
        assert_eq!(target.delta_locked, 0);
    }

    #[test]
    fn negative_update() {
        let target = &mut TargetMetadata {
            bump:           0,
            last_update_at: 0,
            locked:         30,
            delta_locked:   0,
        };

        assert!(target.add_unlocking(30, target.last_update_at).is_ok());
        assert_eq!(target.last_update_at, 0);
        assert_eq!(target.locked, 30);
        assert_eq!(target.delta_locked, -30);

        assert!(target.update(target.last_update_at + 2).is_ok());
        assert_eq!(target.last_update_at, 2);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 0);
    }

    #[test]
    fn unlock_bigger_than_locked() {
        let target = &mut TargetMetadata {
            bump:           0,
            last_update_at: 0,
            locked:         30,
            delta_locked:   0,
        };

        assert!(target.add_unlocking(40, target.last_update_at).is_err());
    }

    #[test]
    fn overflow() {
        let target = &mut TargetMetadata {
            bump:           0,
            last_update_at: 0,
            locked:         u64::MAX,
            delta_locked:   0,
        };

        assert!(target.add_unlocking(1, 0).is_err());
    }
}
