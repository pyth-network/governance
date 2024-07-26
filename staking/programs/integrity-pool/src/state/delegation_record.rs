use {
    crate::{
        error::IntegrityPoolError,
        utils::clock::get_current_epoch,
    },
    anchor_lang::prelude::*,
    borsh::BorshSchema,
};

#[account]
#[derive(BorshSchema)]
pub struct DelegationRecord {
    pub last_epoch: u64,
}

impl DelegationRecord {
    pub const LEN: usize = 8 + 8;
}

impl DelegationRecord {
    pub fn assert_up_to_date(&self) -> Result<()> {
        require_eq!(
            self.last_epoch,
            get_current_epoch()?,
            IntegrityPoolError::OutdatedDelegatorAccounting
        );
        Ok(())
    }

    pub fn advance(&mut self) -> Result<()> {
        self.last_epoch = get_current_epoch()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        anchor_lang::Discriminator,
    };

    #[test]
    #[allow(deprecated)]
    fn test_delegation_record_len() {
        assert!(
            solana_sdk::borsh0_10::get_packed_len::<DelegationRecord>()
                + DelegationRecord::discriminator().len()
                == DelegationRecord::LEN
        );
    }
}
