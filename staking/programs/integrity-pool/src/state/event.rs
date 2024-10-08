use {
    crate::utils::{
        constants::MAX_PUBLISHERS,
        types::{
            frac64,
            FRAC_64_MULTIPLIER_U128,
        },
    },
    anchor_lang::prelude::*,
    bytemuck::{
        Pod,
        Zeroable,
    },
    std::{
        convert::TryInto,
        fmt::Debug,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, Zeroable, Pod, PartialEq, Eq)]
#[repr(C)]
pub struct Event {
    pub epoch:       u64,
    // storing historical values of y
    pub y:           frac64,
    pub extra_space: [frac64; 7],
    pub event_data:  [PublisherEventData; MAX_PUBLISHERS],
}

impl Default for Event {
    fn default() -> Self {
        Self {
            epoch:       0,
            y:           0,
            extra_space: [0; 7],
            event_data:  [PublisherEventData::default(); MAX_PUBLISHERS],
        }
    }
}

impl Event {
    // calculate the reward in pyth with decimals
    pub fn calculate_reward(
        &self,
        amount: frac64, // in pyth with decimals
        publisher_index: usize,
        is_publisher: bool,
    ) -> Result<(frac64, frac64)> {
        let reward_ratio = if is_publisher {
            self.event_data[publisher_index].self_reward_ratio
        } else {
            self.event_data[publisher_index].other_reward_ratio
        };

        let reward_rate = u128::from(self.y) * u128::from(reward_ratio) / FRAC_64_MULTIPLIER_U128;
        let total_reward = u128::from(amount) * reward_rate / FRAC_64_MULTIPLIER_U128;

        if is_publisher {
            return Ok((total_reward.try_into()?, 0));
        }

        let delegation_fee = u128::from(self.event_data[publisher_index].delegation_fee);
        let publisher_reward = total_reward * delegation_fee / FRAC_64_MULTIPLIER_U128;
        let delegator_reward = total_reward - publisher_reward;

        Ok((delegator_reward.try_into()?, publisher_reward.try_into()?))
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

    // This is a number between 0 and 1 that shows the delegation fee rate for the publisher at the
    // time of the event
    pub delegation_fee: frac64,
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        crate::utils::types::FRAC_64_MULTIPLIER,
    };

    #[test]
    fn test_calculate_reward_for_delegator() {
        let mut event = Event {
            // 10%
            y: FRAC_64_MULTIPLIER / 10,
            ..Default::default()
        };

        event.event_data[0] = PublisherEventData {
            self_reward_ratio:  0,
            // ratio = 100%
            other_reward_ratio: FRAC_64_MULTIPLIER,
            delegation_fee:     FRAC_64_MULTIPLIER / 10,
        };
        event.event_data[1] = PublisherEventData {
            self_reward_ratio:  0,
            // ratio = 50%
            other_reward_ratio: FRAC_64_MULTIPLIER / 2,
            delegation_fee:     0,
        };

        let (delegator_reward, publisher_reward) = event
            .calculate_reward(100 * FRAC_64_MULTIPLIER, 0, false)
            .unwrap();
        assert_eq!(delegator_reward, 9 * FRAC_64_MULTIPLIER);
        assert_eq!(publisher_reward, FRAC_64_MULTIPLIER);

        let (delegator_reward, publisher_reward) = event
            .calculate_reward(100 * FRAC_64_MULTIPLIER, 1, false)
            .unwrap();
        assert_eq!(delegator_reward, 5 * FRAC_64_MULTIPLIER);
        assert_eq!(publisher_reward, 0);
    }

    #[test]
    fn test_calculate_reward_for_publisher() {
        let mut event = Event {
            // 10%
            y: FRAC_64_MULTIPLIER / 10,
            ..Default::default()
        };

        event.event_data[0] = PublisherEventData {
            // ratio = 100%
            self_reward_ratio:  FRAC_64_MULTIPLIER,
            other_reward_ratio: 0,
            delegation_fee:     0,
        };
        event.event_data[1] = PublisherEventData {
            // ratio = 50%
            self_reward_ratio:  FRAC_64_MULTIPLIER / 2,
            other_reward_ratio: 0,
            delegation_fee:     0,
        };

        let reward = event
            .calculate_reward(100 * FRAC_64_MULTIPLIER, 0, true)
            .unwrap();
        assert_eq!(reward, (10 * FRAC_64_MULTIPLIER, 0));

        let reward = event
            .calculate_reward(100 * FRAC_64_MULTIPLIER, 1, true)
            .unwrap();
        assert_eq!(reward, (5 * FRAC_64_MULTIPLIER, 0));
    }

    #[test]
    fn test_overflow() {
        let mut event = Event {
            // 100%
            y: FRAC_64_MULTIPLIER,
            ..Default::default()
        };

        event.event_data[0] = PublisherEventData {
            // ratio = 100%
            self_reward_ratio:  FRAC_64_MULTIPLIER,
            other_reward_ratio: 0,
            delegation_fee:     0,
        };

        let reward = event.calculate_reward(u64::MAX, 0, true).unwrap();
        assert_eq!(reward, (u64::MAX, 0));
    }
}
