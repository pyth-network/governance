use {
    crate::error::ErrorCode,
    anchor_lang::prelude::{
        borsh::BorshSchema,
        *,
    },
    std::convert::TryInto,
};

/// This represents a target that users can stake to
/// Currently we store the last time the target account was updated, the current locked balance
/// and the amount by which the locked balance will change in the next epoch
#[account]
#[derive(BorshSchema)]
pub struct TargetMetadata {
    pub bump:              u8,
    pub last_update_at:    u64,
    pub prev_epoch_locked: u64, // locked amount in the previous epoch
    pub locked:            u64,
    pub delta_locked:      i64, // locked = locked + delta_locked for the next epoch
}


impl TargetMetadata {
    pub const LEN: usize = 10240;

    // Updates the TargetMetadata struct.
    // If no time has passed, doesn't do anything
    // If 1 epoch has passed, locked becomes locked + delta_locked
    // If more than 1 epoch has passed, we can assume that no tokens
    // were locked or unlocked in the epochs between the last update and now
    // (otherwise update would've been called already)
    // therefore the logic is the same as the case where 1 epoch has passed
    pub fn update(&mut self, current_epoch: u64) -> Result<()> {
        let n: u64 = current_epoch
            .checked_sub(self.last_update_at)
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?;
        self.last_update_at = current_epoch;
        match n {
            0 => Ok(()),
            1 => {
                self.prev_epoch_locked = self.locked;
                self.locked = self.next_epoch_locked()?;
                self.delta_locked = 0;
                Ok(())
            }
            _ => {
                // >= 2
                self.prev_epoch_locked = self.next_epoch_locked()?;
                self.locked = self.prev_epoch_locked;
                self.delta_locked = 0;
                Ok(())
            }
        }
    }

    pub fn get_current_amount_locked(&self, current_epoch: u64) -> Result<u64> {
        let current_epoch_signed: i64 = current_epoch
            .try_into()
            .map_err(|_| ErrorCode::GenericOverflow)?;
        let last_update_at_signed: i64 = self
            .last_update_at
            .try_into()
            .map_err(|_| ErrorCode::GenericOverflow)?;

        let diff: i64 = current_epoch_signed
            .checked_sub(last_update_at_signed)
            .ok_or(ErrorCode::GenericOverflow)?;

        match diff {
            i64::MIN..=-2 => Err(error!(ErrorCode::NotImplemented)),
            -1 => Ok(self.prev_epoch_locked),
            0 => Ok(self.locked),
            1..=i64::MAX => Ok(self.next_epoch_locked()?),
        }
    }

    // Computes self.locked + self.delta_locked, handling errors and overflow appropriately
    fn next_epoch_locked(&self) -> Result<u64> {
        let x: u64 = (TryInto::<i64>::try_into(self.locked).or(Err(ErrorCode::GenericOverflow))?)
            .checked_add(self.delta_locked)
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?
            .try_into()
            .map_err(|_| error!(ErrorCode::NegativeBalance))?;
        Ok(x)
    }

    // Updates the aggregate account if it is outdated (current_epoch > last_updated_at) and
    // subtracts amount to delta_locked. This method needs to be called everytime a user requests to
    // create a new position.
    pub fn add_locking(&mut self, amount: u64, current_epoch: u64) -> Result<()> {
        self.update(current_epoch)?;

        self.delta_locked = self
            .delta_locked
            .checked_add(amount.try_into().or(Err(ErrorCode::GenericOverflow))?)
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?;
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
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?;

        // Locked + delta_locked should never be negative, because that'd mean the balance staked to
        // the target is negative
        if (TryInto::<i64>::try_into(self.locked).or(Err(ErrorCode::GenericOverflow))?)
            .checked_add(self.delta_locked)
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?
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
            bump:              0,
            last_update_at:    0,
            locked:            0,
            delta_locked:      0,
            prev_epoch_locked: 0,
        };

        assert!(target.update(target.last_update_at + 10).is_ok());
        assert_eq!(target.last_update_at, 10);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 0);
        assert_eq!(target.prev_epoch_locked, 0);
    }

    #[test]
    fn positive_update() {
        let target = &mut TargetMetadata {
            bump:              0,
            last_update_at:    0,
            locked:            0,
            delta_locked:      0,
            prev_epoch_locked: 0,
        };

        assert!(target.add_locking(10, target.last_update_at).is_ok());
        assert_eq!(target.last_update_at, 0);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 10);
        assert_eq!(target.prev_epoch_locked, 0);

        assert_eq!(target.get_current_amount_locked(0).unwrap(), 0);
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(69).unwrap(), 10);

        // Should be a no-op
        assert!(target.update(target.last_update_at).is_ok());
        assert_eq!(target.last_update_at, 0);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 10);
        assert_eq!(target.prev_epoch_locked, 0);

        assert_eq!(target.get_current_amount_locked(0).unwrap(), 0);
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(69).unwrap(), 10);

        assert!(target.update(target.last_update_at + 1).is_ok());

        assert_eq!(target.last_update_at, 1);
        assert_eq!(target.locked, 10);
        assert_eq!(target.delta_locked, 0);
        assert_eq!(target.prev_epoch_locked, 0);

        assert_eq!(target.get_current_amount_locked(0).unwrap(), 0);
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(2).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(69).unwrap(), 10);

        assert!(target.update(target.last_update_at + 1).is_ok());
        assert_eq!(target.last_update_at, 2);
        assert_eq!(target.locked, 10);
        assert_eq!(target.delta_locked, 0);
        assert_eq!(target.prev_epoch_locked, 10);

        assert!(target.get_current_amount_locked(0).is_err());
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(2).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(3).unwrap(), 10);
        assert_eq!(target.get_current_amount_locked(69).unwrap(), 10);
    }

    #[test]
    fn negative_update() {
        let target = &mut TargetMetadata {
            bump:              0,
            last_update_at:    0,
            locked:            30,
            delta_locked:      1,
            prev_epoch_locked: 11,
        };
        // Epoch 0: 30
        // Epoch 1: 0
        // Epoch 2: 0

        assert_eq!(target.get_current_amount_locked(0).unwrap(), 30);
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 31);
        assert_eq!(target.get_current_amount_locked(69).unwrap(), 31);

        assert!(target.add_unlocking(31, target.last_update_at).is_ok());
        assert_eq!(target.last_update_at, 0);
        assert_eq!(target.locked, 30);
        assert_eq!(target.delta_locked, -30);
        assert_eq!(target.prev_epoch_locked, 11);

        assert_eq!(target.get_current_amount_locked(0).unwrap(), 30);
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 0);
        assert_eq!(target.get_current_amount_locked(2).unwrap(), 0);
        assert_eq!(target.get_current_amount_locked(72).unwrap(), 0);

        assert!(target.update(target.last_update_at + 2).is_ok());
        assert_eq!(target.last_update_at, 2);
        assert_eq!(target.locked, 0);
        assert_eq!(target.delta_locked, 0);
        assert_eq!(target.prev_epoch_locked, 0);

        assert!(target.get_current_amount_locked(0).is_err());
        assert_eq!(target.get_current_amount_locked(1).unwrap(), 0);
        assert_eq!(target.get_current_amount_locked(2).unwrap(), 0);
    }

    #[test]
    fn unlock_bigger_than_locked() {
        let target = &mut TargetMetadata {
            bump:              0,
            last_update_at:    0,
            locked:            30,
            delta_locked:      0,
            prev_epoch_locked: 0,
        };

        assert!(target.add_unlocking(40, target.last_update_at).is_err());
    }

    #[test]
    fn overflow() {
        let target = &mut TargetMetadata {
            bump:              0,
            last_update_at:    0,
            locked:            u64::MAX,
            delta_locked:      0,
            prev_epoch_locked: 0,
        };

        assert!(target.add_unlocking(1, 0).is_err());
    }

    #[test]
    fn check_size() {
        assert!(
            anchor_lang::solana_program::borsh::get_packed_len::<TargetMetadata>()
                < TargetMetadata::LEN
        );
    }
}
