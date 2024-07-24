use {
    crate::utils::{
        constants::MAX_PUBLISHERS,
        types::frac64,
    },
    anchor_lang::prelude::*,
    bytemuck::{
        Pod,
        Zeroable,
    },
    std::fmt::Debug,
};

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, Zeroable, Pod, PartialEq, Eq)]
#[repr(C)]
pub struct Event {
    pub epoch:      u64,
    // storing historical values of y
    pub y:          frac64,
    pub event_data: [PublisherEventData; MAX_PUBLISHERS],
}

impl Default for Event {
    fn default() -> Self {
        Self {
            epoch:      0,
            y:          0,
            event_data: [PublisherEventData::default(); MAX_PUBLISHERS],
        }
    }
}

#[derive(
    AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, Zeroable, Pod, Default, PartialEq, Eq,
)]
#[repr(C)]
pub struct PublisherEventData {
    // These numbers are between 0 and 1 and show what percentage of y that should be given as
    // reward. For example, if the publisher has delegated less than their cap, they should get
    // 100% of y. If they have delegated more than their cap, their `self_reward_ratio` will
    // be less than 1 such that the total reward they get is equal to y * cap
    pub self_reward_ratio:  frac64,
    pub other_reward_ratio: frac64,
}
