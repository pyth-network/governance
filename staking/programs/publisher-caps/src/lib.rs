use {
    anchor_lang::prelude::*,
    bytemuck::{
        Pod,
        Zeroable,
    },
};
use pythnet_sdk::{accumulators::merkle::{MerklePath, MerkleRoot}, hashers::keccak256_160::Keccak160, wire::v1::{WormholeMessage, WormholePayload}};
use wormhole_solana_vaas::zero_copy::VaaAccount;
use std::convert::TryInto;
use anchor_lang::solana_program::program_memory::sol_memcmp;

declare_id!("BZ1jqX41oh3NaF7FmkrCWUrd4eQZQqid1edPLGxzJMc2");

pub const WORMHOLE_RECEIVER : Pubkey = pubkey!("HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ");
pub const MAX_CAPS: usize = 1024;

pub fn get_dummy_publisher(i: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes[0] = (i % 256) as u8;
    bytes[1] = (i / 256) as u8;
    Pubkey::from(bytes)
}

#[program]
pub mod publisher_caps {
    use super::*;

    pub fn init_publisher_caps(ctx: Context<InitPublisherCaps>) -> Result<()> {
        let publisher_caps = &mut ctx.accounts.publisher_caps.load_init()?;
        publisher_caps.write_authority = *ctx.accounts.signer.key;
        Ok(())
    }

    pub fn write_publisher_caps(ctx: Context<WritePublisherCaps>, index : u32, data : Vec<u8>) -> Result<()>{
        {
            let publisher_caps =  &ctx.accounts.publisher_caps.load()?;
            require_eq!(publisher_caps.is_verified, 0, PublisherCapsError::CantMutateVerifiedPublisherCaps);
        }

        let binding = &mut ctx.accounts.publisher_caps.to_account_info();
        let account_data = &mut binding.try_borrow_mut_data()?;
        require!(account_data.len() >= PublisherCaps::HEADER_LEN.saturating_add(index.try_into().unwrap()).saturating_add(data.len()), PublisherCapsError::AccountDataTooSmall);
        sol_memcmp(&account_data[PublisherCaps::HEADER_LEN + index as usize..], &data, data.len());
        Ok(())
    }

    pub fn verify_publisher_caps(ctx: Context<VerifyPublisherCaps>, proof : Vec<[u8;20]>) -> Result<()> {
        let vaa = VaaAccount::load_unchecked(&ctx.accounts.encoded_vaa);

        let number_of_publishers : usize = { 
            let publisher_caps = &mut ctx.accounts.publisher_caps.load_mut()?;
            publisher_caps.is_verified = 1;
            publisher_caps.num_publishers as usize
        };

        let vaa_payload = vaa.payload();
        let wormhole_message = WormholeMessage::try_from_bytes(vaa_payload)
        .map_err(|_| PublisherCapsError::InvalidWormholeMessage)?;
        let root: MerkleRoot<Keccak160> = MerkleRoot::new(match wormhole_message.payload {
            WormholePayload::Merkle(merkle_root) => merkle_root.root,
        });

        // if !root.check(MerklePath::<Keccak160>::new(proof), &ctx.accounts.publisher_caps.to_account_info().try_borrow_data()?[PublisherCaps::HEADER_LEN..PublisherCaps::HEADER_LEN + 8 + 8 + number_of_publishers * PublisherCap::LEN]) {
        //     return err!(PublisherCapsError::InvalidMerkleProof);
        // }

        Ok(())
    }

    // TODO: Actually implement this using wormhole
    pub fn post_publisher_caps(
        ctx: Context<PostPublisherCaps>,
        first_publisher: Pubkey,
        first_publisher_cap: u64,
    ) -> Result<()> {
        let publisher_caps = &mut ctx.accounts.publisher_caps.load_init()?;
        publisher_caps.timestamp = Clock::get()?.unix_timestamp;
        publisher_caps.num_publishers = MAX_CAPS as u64;

        publisher_caps.caps[0].pubkey = first_publisher;
        publisher_caps.caps[0].cap = first_publisher_cap;

        for i in 1..MAX_CAPS {
            publisher_caps.caps[i].pubkey = get_dummy_publisher(i);
            publisher_caps.caps[i].cap = i as u64;
        }

        // publisher caps should always be sorted
        publisher_caps.caps.sort();

        Ok(())
    }
}

#[repr(C)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Zeroable, Pod, Eq, Debug, PartialEq)]
pub struct PublisherCap {
    pub pubkey: Pubkey,
    pub cap:    u64,
}

impl PublisherCap {
    pub const LEN: usize = 32 + 8;
}

impl PartialOrd for PublisherCap {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PublisherCap {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.pubkey.cmp(&other.pubkey)
    }
}

#[account(zero_copy)]
pub struct PublisherCaps {
    pub write_authority: Pubkey,
    pub is_verified:  u8,
    pub _unused :   [u8; 7], 
    pub timestamp:      i64,
    pub num_publishers: u64,
    pub caps:           [PublisherCap; MAX_CAPS],
}


impl PublisherCaps {
    pub const HEADER_LEN : usize = 8+ 32 + 8;
    pub const LEN: usize = Self::HEADER_LEN + 8 + 8 + MAX_CAPS * PublisherCap::LEN;
}

#[derive(Accounts)]
pub struct PostPublisherCaps<'info> {
    pub signer:         Signer<'info>,
    #[account(zero)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct InitPublisherCaps<'info> {
    pub signer:          Signer<'info>,
    #[account(zero)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct WritePublisherCaps<'info> {
    pub write_authority:          Signer<'info>,
    #[account(mut, has_one = write_authority)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct VerifyPublisherCaps<'info> {
    pub signer : Signer<'info>,
    #[account(mut)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
    #[account(owner = WORMHOLE_RECEIVER)]
    /// CHECK: We aren't deserializing the VAA here but later with VaaAccount::load_unchecked, which is the recommended way
    pub encoded_vaa : AccountInfo<'info>,
}

#[error_code]
pub enum PublisherCapsError {
    InvalidTimestamp,
    InvalidWormholeMessage,
    InvalidMerkleProof,
    CantMutateVerifiedPublisherCaps,
    AccountDataTooSmall
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(deprecated)]
    fn test_size() {
        assert_eq!(std::mem::size_of::<PublisherCap>(), PublisherCap::LEN);
        assert!(std::mem::size_of::<PublisherCaps>() + 8 <= PublisherCaps::LEN);
    }
}
