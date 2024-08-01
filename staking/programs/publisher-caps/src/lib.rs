use {
    anchor_lang::prelude::*,
    bytemuck::{
        Pod,
        Zeroable,
    },
    pythnet_sdk::{
        accumulators::merkle::{
            MerklePath,
            MerkleRoot,
        },
        hashers::keccak256_160::Keccak160,
        wire::v1::{
            WormholeMessage,
            WormholePayload,
        },
    },
    std::convert::TryInto,
    wormhole_solana_vaas::zero_copy::VaaAccount,
};

declare_id!("BZ1jqX41oh3NaF7FmkrCWUrd4eQZQqid1edPLGxzJMc2");

pub const WORMHOLE_RECEIVER: Pubkey = pubkey!("HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ");
pub const MAX_CAPS: usize = 1024;

pub fn get_dummy_publisher(i: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes[0] = (i % 256) as u8;
    bytes[1] = (i / 256) as u8;
    Pubkey::from(bytes)
}

#[program]
pub mod publisher_caps {
    use {
        super::*,
        anchor_lang::solana_program::program_memory::sol_memcpy,
    };

    pub fn init_publisher_caps(ctx: Context<InitPublisherCaps>) -> Result<()> {
        let publisher_caps = &mut ctx.accounts.publisher_caps.load_init()?;
        publisher_caps.write_authority = *ctx.accounts.signer.key;
        Ok(())
    }

    pub fn write_publisher_caps(
        ctx: Context<WritePublisherCaps>,
        index: u32,
        data: Vec<u8>,
    ) -> Result<()> {
        {
            let publisher_caps = &ctx.accounts.publisher_caps.load()?;
            require_eq!(
                publisher_caps.is_verified,
                0,
                PublisherCapsError::CantMutateVerifiedPublisherCaps
            );
        }

        let binding = &mut ctx.accounts.publisher_caps.to_account_info();
        let account_data = &mut binding.try_borrow_mut_data()?;
        require!(
            account_data.len()
                >= PublisherCaps::HEADER_LEN
                    .saturating_add(index.try_into().unwrap())
                    .saturating_add(data.len()),
            PublisherCapsError::AccountDataTooSmall
        );
        sol_memcpy(
            &mut account_data[PublisherCaps::HEADER_LEN + index as usize..],
            &data,
            data.len(),
        );
        Ok(())
    }

    pub fn verify_publisher_caps(
        ctx: Context<VerifyPublisherCaps>,
        proof: Vec<[u8; 20]>,
    ) -> Result<()> {
        let vaa = VaaAccount::load_unchecked(&ctx.accounts.encoded_vaa);

        let number_of_publishers: usize = {
            let publisher_caps = &mut ctx.accounts.publisher_caps.load_mut()?;
            publisher_caps.is_verified = 1;
            publisher_caps.num_publishers() as usize
        };

        let vaa_payload = vaa.payload();
        let wormhole_message = WormholeMessage::try_from_bytes(vaa_payload)
            .map_err(|_| PublisherCapsError::InvalidWormholeMessage)?;
        let root: MerkleRoot<Keccak160> = MerkleRoot::new(match wormhole_message.payload {
            WormholePayload::Merkle(merkle_root) => merkle_root.root,
        });

        if !root.check(
            MerklePath::<Keccak160>::new(proof),
            &ctx.accounts
                .publisher_caps
                .to_account_info()
                .try_borrow_data()?[PublisherCaps::HEADER_LEN
                ..PublisherCaps::HEADER_LEN + 1 + 8 + 2 + number_of_publishers * PublisherCap::LEN],
        ) {
            return err!(PublisherCapsError::InvalidMerkleProof);
        }

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
    pub write_authority:               Pubkey,
    pub is_verified:                   u8,
    pub padding:                       [u8; 4],
    pub publisher_caps_message_buffer: [u8; 1 + 8 + 2 + MAX_CAPS * PublisherCap::LEN],
}

impl PublisherCaps {
    pub fn discriminator(&self) -> u8 {
        self.publisher_caps_message_buffer[0]
    }

    pub fn timestamp(&self) -> i64 {
        i64::from_be_bytes(self.publisher_caps_message_buffer[1..9].try_into().unwrap())
    }

    pub fn num_publishers(&self) -> u16 {
        u16::from_be_bytes(
            self.publisher_caps_message_buffer[9..11]
                .try_into()
                .unwrap(),
        )
    }

    pub fn get_cap(&self, i: usize) -> PublisherCap {
        PublisherCap {
            pubkey: Pubkey::try_from_slice(
                &self.publisher_caps_message_buffer
                    [11 + i * PublisherCap::LEN..11 + i * PublisherCap::LEN + 32],
            )
            .unwrap(),
            cap:    u64::from_be_bytes(
                self.publisher_caps_message_buffer
                    [11 + i * PublisherCap::LEN + 32..11 + i * PublisherCap::LEN + 40]
                    .try_into()
                    .unwrap(),
            ),
        }
    }

    pub fn get_caps(&self) -> &[PublisherCap; MAX_CAPS] {
        bytemuck::from_bytes(self.publisher_caps_message_buffer[11..].try_into().unwrap())
    }

    pub fn get_first_bytes(&self) -> [u8; 2] {
        self.publisher_caps_message_buffer[Self::HEADER_LEN + 9..Self::HEADER_LEN + 11]
            .try_into()
            .unwrap()
    }
}


impl PublisherCaps {
    pub const HEADER_LEN: usize = 8 + 32 + 1 + 4;
    pub const LEN: usize = Self::HEADER_LEN + 1 + 8 + 2 + MAX_CAPS * PublisherCap::LEN;
}

#[derive(Accounts)]
pub struct PostPublisherCaps<'info> {
    pub signer:         Signer<'info>,
    #[account(zero)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct InitPublisherCaps<'info> {
    pub signer:         Signer<'info>,
    #[account(zero)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct WritePublisherCaps<'info> {
    pub write_authority: Signer<'info>,
    #[account(mut, has_one = write_authority)]
    pub publisher_caps:  AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct VerifyPublisherCaps<'info> {
    pub signer:         Signer<'info>,
    #[account(mut)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
    #[account(owner = WORMHOLE_RECEIVER)]
    /// CHECK: We aren't deserializing the VAA here but later with VaaAccount::load_unchecked,
    /// which is the recommended way
    pub encoded_vaa:    AccountInfo<'info>,
}

#[error_code]
pub enum PublisherCapsError {
    InvalidTimestamp,
    InvalidWormholeMessage,
    InvalidMerkleProof,
    CantMutateVerifiedPublisherCaps,
    AccountDataTooSmall,
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
