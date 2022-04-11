use crate::error::ErrorCode;
use anchor_lang::prelude::*;
use std::convert::TryInto;

#[account]
#[derive(Default)]
pub struct ProductMetadata {
    pub bump: u8,
    pub last_update_at: u64,
    pub locked: u64,
    pub delta_locked: i64, // locked = locked + delta_locked for the next epoch
}

impl ProductMetadata {
    pub fn update(&mut self, n: u64) -> Result<()> {
        self.last_update_at = self
            .last_update_at
            .checked_add(n)
            .ok_or(error!(ErrorCode::GenericOverflow))?;
        match n {
            0 => Ok(()),
            _ => {
                self.locked = (self.locked as i64)
                    .checked_add(self.delta_locked)
                    .ok_or(error!(ErrorCode::GenericOverflow))?
                    .try_into()
                    .or(Err(ErrorCode::NegativeBalance))?;
                self.delta_locked = 0;
                Ok(())
            }
        }
    }

    pub fn add_locking(&mut self, amount : u64) -> Result<()> {
        self.delta_locked = self.delta_locked.checked_add(amount as i64).ok_or(error!(ErrorCode::GenericOverflow))?;
        Ok(())
    }

    pub fn add_unlocking(&mut self, amount : u64) -> Result<()> {
        if amount > self.locked{
            return Err(error!(ErrorCode::NegativeBalance));
        }
        self.delta_locked = self.delta_locked.checked_sub(amount as i64).ok_or(error!(ErrorCode::GenericOverflow))?;
        Ok(())
    }
}

#[cfg(test)]
pub mod tests {
    use crate::state::product::{ProductMetadata};
    
    #[test]
    fn zero_update() {
        let product = &mut ProductMetadata {
            bump : 0,
            last_update_at : 0,
            locked : 0,
            delta_locked : 0
        };

        product.update(10);
        assert_eq!(
            product.last_update_at,
            10
        );
        assert_eq!(
            product.locked,
            0
        );
        assert_eq!(
            product.delta_locked,
            0
        );
    }

    #[test]
    fn positive_update() {
        let product = &mut ProductMetadata {
            bump : 0,
            last_update_at : 0,
            locked : 0,
            delta_locked : 0
        };

        product.add_locking(10);
        assert_eq!(
            product.last_update_at,
            0
        );
        assert_eq!(
            product.locked,
            0
        );
        assert_eq!(
            product.delta_locked,
            10
        );

        product.update(1);

        assert_eq!(
            product.last_update_at,
            1
        );
        assert_eq!(
            product.locked,
            10
        );
        assert_eq!(
            product.delta_locked,
            0
        );

    }

    #[test]
    fn negative_update() {
        let product = &mut ProductMetadata {
            bump : 0,
            last_update_at : 0,
            locked : 30,
            delta_locked : 0
        };

        product.add_unlocking(20);
        assert_eq!(
            product.last_update_at,
            0
        );
        assert_eq!(
            product.locked,
            30
        );
        assert_eq!(
            product.delta_locked,
            -20
        );

        product.update(2);

        assert_eq!(
            product.last_update_at,
            2
        );
        assert_eq!(
            product.locked,
            10
        );
        assert_eq!(
            product.delta_locked,
            0
        );
    }

    #[test]
    fn unlock_bigger_than_locked() {
        let product = &mut ProductMetadata {
            bump : 0,
            last_update_at : 0,
            locked : 30,
            delta_locked : 0
        };

        assert!(product.add_unlocking(40).is_err());

        product.update(5);

        assert_eq!(
            product.last_update_at,
            5
        );
        assert_eq!(
            product.locked,
            30
        );
        assert_eq!(
            product.delta_locked,
            0
        );

        assert!(product.add_unlocking(40).is_err());
    }

}

