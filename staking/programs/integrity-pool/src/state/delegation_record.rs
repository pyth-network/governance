use {
    crate::error::IntegrityPoolError,
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
    pub fn assert_up_to_date(&self, current_epoch: u64) -> Result<()> {
        require_eq!(
            self.last_epoch,
            current_epoch,
            IntegrityPoolError::OutdatedDelegatorAccounting
        );
        Ok(())
    }

    pub fn advance(&mut self, current_epoch: u64) -> Result<()> {
        self.last_epoch = current_epoch;
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

    #[test]
    fn test_advance() {
        let mut record = DelegationRecord { last_epoch: 0 };
        record.advance(1).unwrap();
        assert_eq!(record.last_epoch, 1);
    }

    #[test]
    fn test_assert_up_to_date() {
        let record = DelegationRecord { last_epoch: 100 };
        assert!(record.assert_up_to_date(100).is_ok());
        assert!(record.assert_up_to_date(101).is_err());
        assert!(record.assert_up_to_date(99).is_err());
    }
}
