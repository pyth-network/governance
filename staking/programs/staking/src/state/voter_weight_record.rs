use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

pub const VOTER_WEIGHT_RECORD_SIZE: usize = 150;

/// Had to copy paste this instead of the macro voter_weight_record!(crate::ID) because the error's macros are not updated for anchor 0.22.0
#[derive(Clone, Debug)]
pub struct VoterWeightRecord(spl_governance_addin_api::voter_weight::VoterWeightRecord);

impl anchor_lang::AccountDeserialize for VoterWeightRecord {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        let mut data = buf;
        let vwr: spl_governance_addin_api::voter_weight::VoterWeightRecord =
            anchor_lang::AnchorDeserialize::deserialize(&mut data)
                .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        if !solana_program::program_pack::IsInitialized::is_initialized(&vwr) {
            return Err(anchor_lang::error::ErrorCode::AccountDidNotSerialize.into());
        }
        Ok(VoterWeightRecord(vwr))
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        let mut data = buf;
        let vwr: spl_governance_addin_api::voter_weight::VoterWeightRecord =
            anchor_lang::AnchorDeserialize::deserialize(&mut data)
                .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotDeserialize)?;
        Ok(VoterWeightRecord(vwr))
    }
}

impl anchor_lang::AccountSerialize for VoterWeightRecord {
    fn try_serialize<W: std::io::Write>(&self, writer: &mut W) -> Result<()> {
        let mut to_write = &mut self.0.clone();
        //to_write.account_discriminator = *b"2ef99b4b";
        to_write.account_discriminator =
            VoterWeightRecord::discriminator();
        anchor_lang::AnchorSerialize::serialize(to_write, writer)
            .map_err(|_| anchor_lang::error::ErrorCode::AccountDidNotSerialize)?;
        Ok(())
    }
}

impl anchor_lang::Owner for VoterWeightRecord {
    fn owner() -> Pubkey {
        crate::ID
    }
}

impl std::ops::Deref for VoterWeightRecord {
    type Target = spl_governance_addin_api::voter_weight::VoterWeightRecord;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for VoterWeightRecord {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

impl anchor_lang::Discriminator for VoterWeightRecord {
    fn discriminator() -> [u8; 8] {
        //*b"2ef99b4b"
        return spl_governance_addin_api::voter_weight::VoterWeightRecord::ACCOUNT_DISCRIMINATOR;
    }
}
