use {
    anchor_lang::prelude::*,
    bytemuck::{
        Pod,
        Zeroable,
    },
};

declare_id!("BZ1jqX41oh3NaF7FmkrCWUrd4eQZQqid1edPLGxzJMc2");

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
    pub timestamp:      i64,
    pub num_publishers: u64,
    pub caps:           [PublisherCap; MAX_CAPS],
}

impl PublisherCaps {
    pub const LEN: usize = 8 + 8 + 8 + MAX_CAPS * PublisherCap::LEN;
}

#[derive(Accounts)]
pub struct PostPublisherCaps<'info> {
    pub signer:         Signer<'info>,
    #[account(zero)]
    pub publisher_caps: AccountLoader<'info, PublisherCaps>,
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
