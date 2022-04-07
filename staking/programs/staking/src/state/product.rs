use crate::error::ErrorCode;
use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ProductMetadata {
    pub last_update_at: u64,
    pub locking: u64,
    pub locked: u64,
    pub pre_unlocking: u64,
    pub unlocking_1: u64,
    pub unlocking_2: u64,
}

impl ProductMetadata {
    pub fn turn_n_pages(&mut self, n: u64) -> Result<()> {
        self.last_update_at = self
            .last_update_at
            .checked_add(n)
            .ok_or(error!(ErrorCode::GenericOverflow))?;
        match n {
            0 => Ok(()),
            1 => {
                self.locked = self
                    .locked
                    .checked_sub(self.pre_unlocking)
                    .ok_or(error!(ErrorCode::GenericOverflow))?
                    .checked_add(self.locking)
                    .ok_or(error!(ErrorCode::GenericOverflow))?;
                self.unlocking_1 = self.pre_unlocking;
                self.unlocking_2 = self.unlocking_1;
                self.pre_unlocking = 0;
                self.locking = 0;
                Ok(())
            }
            2 => {
                self.locked = self
                    .locked
                    .checked_sub(self.pre_unlocking)
                    .ok_or(error!(ErrorCode::GenericOverflow))?
                    .checked_add(self.locking)
                    .ok_or(error!(ErrorCode::GenericOverflow))?;
                self.unlocking_2 = self.pre_unlocking;
                self.unlocking_1 = 0;
                self.pre_unlocking = 0;
                self.locking = 0;
                Ok(())
            }
            _ => {
                self.locked = self
                    .locked
                    .checked_sub(self.pre_unlocking)
                    .ok_or(error!(ErrorCode::GenericOverflow))?
                    .checked_add(self.locking)
                    .ok_or(error!(ErrorCode::GenericOverflow))?;
                self.unlocking_2 = 0;
                self.unlocking_1 = 0;
                self.pre_unlocking = 0;
                self.locking = 0;
                Ok(())
            }
        }
    }
}
