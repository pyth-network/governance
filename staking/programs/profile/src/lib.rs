//! Profile program
//!
//! This program allows a Solana user to map their Solana address to their addresses on other chains
use anchor_lang::prelude::*;

declare_id!("prfmVhiQTN5Spgoxa8uZJba35V1s7XXReqbBiqPDWeJ");

#[program]
pub mod profile {
    use super::*;

    pub fn update_identity(ctx: Context<UpdateIdentity>, identity: Identity) -> Result<()> {
        ctx.accounts.identity_account.identity = identity;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(identity: Identity)]
pub struct UpdateIdentity<'info> {
    #[account(mut)]
    payer:            Signer<'info>,
    #[account(init_if_needed, payer = payer, space = identity.size(), seeds = [&[identity.ecosystem_id_as_u8()], payer.key().as_ref()], bump ) ]
    identity_account: Account<'info, IdentityAccount>,
    system_program:   Program<'info, System>,
}

#[account]
pub struct IdentityAccount {
    identity: Identity,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub enum Identity {
    Evm { pubkey: Option<[u8; 20]> },
}

impl Identity {
    fn ecosystem_id_as_u8(&self) -> u8 {
        match self {
            Identity::Evm { .. } => 0,
        }
    }

    fn size(&self) -> usize {
        8 + 1
            + match self {
                Identity::Evm { .. } => 21,
            }
    }
}

#[cfg(test)]
pub mod tests {
    use {
        super::*,
        anchor_lang::Discriminator,
    };

    #[test]
    fn check_size() {
        let evm_identity = Identity::Evm {
            pubkey: Some([0u8; 20]),
        };

        assert_eq!(
            IdentityAccount::discriminator().len() + evm_identity.try_to_vec().unwrap().len(),
            evm_identity.size()
        );
    }
}
