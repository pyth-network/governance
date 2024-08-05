use {
    anchor_lang::{
        prelude::*,
        solana_program::program_memory::sol_memcpy,
    },
    arrayref::array_ref,
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
pub const PRICE_FEEDS_EMITTER_ADDRESS: Pubkey =
    pubkey!("G9LV2mp9ua1znRAfYwZz5cPiJMAbo1T6mbjdQsDZuMJg");
pub const PRICE_FEEDS_EMITTER_CHAIN: u16 = 26; //pythnet
pub const MAX_CAPS: usize = 1024;

#[program]
pub mod publisher_caps {
    use super::*;

    pub fn init_publisher_caps(ctx: Context<InitPublisherCaps>) -> Result<()> {
        let publisher_caps = &mut ctx.accounts.publisher_caps.load_init()?;
        publisher_caps.write_authority = *ctx.accounts.signer.key;
        publisher_caps.is_verified = 0;
        Ok(())
    }

    pub fn write_publisher_caps(
        ctx: Context<WritePublisherCaps>,
        index: u32,
        data: Vec<u8>,
    ) -> Result<()> {
        {
            let publisher_caps = &mut ctx.accounts.publisher_caps.load()?;

            require_eq!(
                publisher_caps.is_verified,
                0,
                PublisherCapsError::CantMutateVerifiedPublisherCaps
            );
        }

        require_gte!(
            PublisherCaps::LEN,
            PublisherCaps::HEADER_LEN
                .saturating_add(index.try_into().unwrap())
                .saturating_add(data.len()),
            PublisherCapsError::DataOverflow
        );

        let account_info = ctx.accounts.publisher_caps.to_account_info();
        sol_memcpy(
            &mut account_info.try_borrow_mut_data().unwrap()
                [PublisherCaps::HEADER_LEN + index as usize..],
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
        let publisher_caps = &mut ctx.accounts.publisher_caps.load_mut()?;


        require_eq!(
            Pubkey::from(vaa.emitter_address()),
            PRICE_FEEDS_EMITTER_ADDRESS,
            PublisherCapsError::WrongEmitterAddress
        );
        require_eq!(
            vaa.emitter_chain(),
            PRICE_FEEDS_EMITTER_CHAIN,
            PublisherCapsError::WrongEmitterChain
        );

        publisher_caps.is_verified = 1;

        require_eq!(
            publisher_caps.discriminator(),
            2,
            PublisherCapsError::WrongDiscriminator // This is not a PublisherStakeCaps message
        );

        let wormhole_message = WormholeMessage::try_from_bytes(vaa.payload())
            .map_err(|_| PublisherCapsError::InvalidWormholeMessage)?;
        let root: MerkleRoot<Keccak160> = MerkleRoot::new(match wormhole_message.payload {
            WormholePayload::Merkle(merkle_root) => merkle_root.root,
        });

        if !root.check(
            MerklePath::<Keccak160>::new(proof),
            &publisher_caps.publisher_caps_message_buffer
                [..1 + 8 + 2 + publisher_caps.num_publishers() as usize * PublisherCap::LEN],
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
    pub padding:                       [u8; 4], /* We need this to align the PublisherCap's to 8
                                                 * bytes */
    pub publisher_caps_message_buffer: [u8; 1 + 8 + 2 + MAX_CAPS * PublisherCap::LEN],
}


// bytemuck uses little endian, so we need we write this implementation to convert the bytes to big
// endian
impl PublisherCaps {
    pub const HEADER_LEN: usize = 8 + 32 + 1 + 4;
    pub const LEN: usize = Self::HEADER_LEN + 1 + 8 + 2 + MAX_CAPS * PublisherCap::LEN;

    pub fn discriminator(&self) -> u8 {
        self.publisher_caps_message_buffer[0]
    }

    pub fn publish_time(&self) -> i64 {
        i64::from_be_bytes(*array_ref!(self.publisher_caps_message_buffer, 1, 8))
    }

    pub fn num_publishers(&self) -> u16 {
        u16::from_be_bytes(*array_ref!(self.publisher_caps_message_buffer, 9, 2))
    }

    pub fn caps(&self) -> &[PublisherCap; MAX_CAPS] {
        bytemuck::from_bytes(&self.publisher_caps_message_buffer[11..])
    }

    pub fn get_cap(&self, i: usize) -> PublisherCap {
        PublisherCap {
            pubkey: Pubkey::from(*array_ref!(
                self.publisher_caps_message_buffer,
                11 + i * PublisherCap::LEN,
                32
            )),
            cap:    u64::from_be_bytes(*array_ref!(
                self.publisher_caps_message_buffer,
                11 + i * PublisherCap::LEN + 32,
                8
            )),
        }
    }
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
    #[account(mut, has_one = write_authority @ PublisherCapsError::WrongWriteAuthority)]
    pub publisher_caps:  AccountLoader<'info, PublisherCaps>,
}

#[derive(Accounts)]
pub struct VerifyPublisherCaps<'info> {
    pub signer:         Signer<'info>,
    #[account(mut)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
    /// CHECK: We aren't deserializing the VAA here but later with VaaAccount::load_unchecked,
    /// which is the recommended way
    #[account(owner = WORMHOLE_RECEIVER @ PublisherCapsError::WrongVaaOwner)]
    pub encoded_vaa:    AccountInfo<'info>,
}

#[error_code]
pub enum PublisherCapsError {
    InvalidTimestamp,
    InvalidWormholeMessage,
    InvalidMerkleProof,
    CantMutateVerifiedPublisherCaps,
    DataOverflow,
    WrongVaaOwner,
    WrongWriteAuthority,
    WrongEmitterAddress,
    WrongEmitterChain,
    WrongDiscriminator,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[allow(deprecated)]
    fn test_size() {
        assert_eq!(std::mem::size_of::<PublisherCap>(), PublisherCap::LEN);
        assert_eq!(std::mem::size_of::<PublisherCaps>() + 8, PublisherCaps::LEN);
    }
}
