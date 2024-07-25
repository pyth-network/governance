use {
    super::event::Event,
    crate::{
        error::IntegrityPoolError,
        state::event::PublisherEventData,
        utils::{
            clock::{
                get_current_epoch,
                time_to_epoch,
                UNLOCKING_DURATION,
            },
            constants::{
                MAX_EVENTS,
                MAX_PUBLISHERS,
            },
            types::{
                frac64,
                FRAC_64_MULTIPLIER_U128,
            },
        },
    },
    anchor_lang::prelude::*,
    borsh::BorshSchema,
    bytemuck::{
        Pod,
        Zeroable,
    },
    publisher_caps::{
        PublisherCaps,
        MAX_CAPS,
    },
    staking::state::positions::{
        PositionState,
        TargetWithParameters,
        MAX_POSITIONS,
    },
    std::{
        cell::Ref,
        cmp::min,
        convert::TryInto,
    },
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Zeroable, Pod, Eq, Debug, PartialEq)]
#[repr(C)]
pub struct PublisherData {
    pub public_key: Pubkey,
    pub cap:        u64,
}

// record of delegation state for an epoch
#[derive(
    AnchorSerialize, AnchorDeserialize, Clone, Copy, Zeroable, Pod, Eq, Debug, PartialEq, Default,
)]
#[repr(C)]
pub struct DelegationState {
    // total delegation at the beginning of the epoch
    pub total_delegation:          u64,
    // amount of delegate/undelegate during the epoch
    // will take effect at the end of the epoch
    pub positive_delta_delegation: u64,
    pub negative_delta_delegation: u64,
}

#[account(zero_copy)]
#[repr(C)]
pub struct PoolData {
    pub last_updated_epoch:       u64,
    pub publishers:               [Pubkey; MAX_PUBLISHERS],
    pub caps:                     [u64; MAX_PUBLISHERS],
    pub prev_del_state:           [DelegationState; MAX_PUBLISHERS],
    pub del_state:                [DelegationState; MAX_PUBLISHERS],
    pub prev_self_del_state:      [DelegationState; MAX_PUBLISHERS],
    pub self_del_state:           [DelegationState; MAX_PUBLISHERS],
    pub publisher_stake_accounts: [Pubkey; MAX_PUBLISHERS],
    pub events:                   [Event; MAX_EVENTS],
    pub num_events:               u64,
}

impl PoolData {
    // Allow 2 MB of data
    pub const LEN: usize = 2 * 1024 * 1024;

    pub fn get_event_mut(&mut self, index: usize) -> &mut Event {
        // unwrap is safe because index is always in bounds
        self.events.get_mut(index % MAX_EVENTS).unwrap()
    }

    pub fn get_event(&self, index: usize) -> &Event {
        // unwrap is safe because index is always in bounds
        self.events.get(index % MAX_EVENTS).unwrap()
    }

    pub fn calculate_reward_for_event(
        &self,
        event: &Event,
        amount: u64,
        stake_account_positions_key: &Pubkey,
        publisher_index: usize,
    ) -> Result<frac64> {
        let reward_ratio =
            if &self.publisher_stake_accounts[publisher_index] == stake_account_positions_key {
                event.event_data[publisher_index].self_reward_ratio
            } else {
                event.event_data[publisher_index].other_reward_ratio
            };
        let reward_rate = u128::from(event.y) * u128::from(reward_ratio) / FRAC_64_MULTIPLIER_U128;
        let reward_amount: frac64 = (u128::from(amount) * reward_rate).try_into()?;
        Ok(reward_amount)
    }

    pub fn calculate_reward(
        &self,
        from_epoch: u64,
        stake_account_positions_key: &Pubkey,
        positions: Ref<staking::state::positions::PositionData>,
        publisher: &Pubkey,
        pool_authority: &Pubkey,
    ) -> Result<frac64> {
        self.assert_up_to_date()?;


        let publisher_index = self.get_publisher_index(publisher)?;
        let mut last_event_index: usize = self.num_events as usize;
        let mut reward: frac64 = 0;
        loop {
            // prevent infinite loop and double counting events
            // by breaking the loop when visiting all events
            if self.num_events as usize == last_event_index + MAX_EVENTS {
                break;
            }

            match last_event_index {
                0 => break,
                _ => last_event_index -= 1,
            }

            let event = self.get_event(last_event_index);
            if event.epoch < from_epoch {
                break;
            }

            let mut amount = 0_u64;
            for i in 0..MAX_POSITIONS {
                let position = positions.read_position(i)?;
                if let Some(position) = position {
                    let position_state =
                        position.get_current_position(event.epoch, UNLOCKING_DURATION)?;
                    if matches!(
                        position.target_with_parameters,
                        TargetWithParameters::IntegrityPool {
                            pool_authority: ref position_pool_authority,
                            publisher: ref position_publisher
                        } if position_publisher == publisher && position_pool_authority == pool_authority
                    ) && matches!(position_state, PositionState::LOCKED)
                    {
                        amount += position.amount;
                    }
                }
            }

            reward += self.calculate_reward_for_event(
                event,
                amount,
                stake_account_positions_key,
                publisher_index,
            )?;
        }
        Ok(reward)
    }

    pub fn advance(&mut self, publisher_caps: &PublisherCaps, y: frac64) -> Result<()> {
        let current_epoch = get_current_epoch()?;
        let mut new_publishers: [u8; 128] = [0_u8; MAX_CAPS / 8];

        require_gt!(
            current_epoch,
            self.last_updated_epoch,
            IntegrityPoolError::PoolDataAlreadyUpToDate
        );
        require_eq!(
            current_epoch,
            time_to_epoch(publisher_caps.timestamp)?,
            IntegrityPoolError::OutdatedPublisherCaps
        );

        // self.update_publishers(publisher_caps)?;

        // create the reward event for last_updated_epoch using current del_state before updating
        // which corresponds to del_state at the last_updated_epoch

        let epochs_passed = current_epoch - self.last_updated_epoch;
        let mut one_ok = false;
        let mut i = 0;

        for epoch in self.last_updated_epoch..current_epoch {
            let event =
                self.get_event_mut((self.num_events + epoch - self.last_updated_epoch) as usize);
            event.epoch = epoch;
            event.y = y;
        }

        while (i < MAX_PUBLISHERS && self.publishers[i] != Pubkey::default()) {
                let cap_index = Self::get_publisher_cap_index(&self.publishers[i], publisher_caps);
                
                if let Ok(cap_index) = cap_index {
                    one_ok = true;
                    self.create_reward_events_for_publisher(y, self.last_updated_epoch, self.last_updated_epoch + 1, i, publisher_caps.caps[cap_index].cap)?;
                    new_publishers[cap_index / 8] |= (1 << (cap_index % 8));
                }
            
                let (next_del_state, next_self_del_state) = (
                    DelegationState {
                        total_delegation:          self.del_state[i].total_delegation
                            + self.del_state[i].positive_delta_delegation
                            - self.del_state[i].negative_delta_delegation,
                        positive_delta_delegation: 0,
                        negative_delta_delegation: 0,
                    },
                    DelegationState {
                        total_delegation:          self.self_del_state[i].total_delegation
                            + self.self_del_state[i].positive_delta_delegation
                            - self.self_del_state[i].negative_delta_delegation,
                        positive_delta_delegation: 0,
                        negative_delta_delegation: 0,
                    },
                );
                match epochs_passed {
                    0 => return err!(IntegrityPoolError::ThisCodeShouldBeUnreachable),
                    1 => {
                        self.prev_del_state[i] = self.del_state[i];
                        self.prev_self_del_state[i] = self.self_del_state[i];
                    }
                    _ => {
                        self.prev_del_state[i] = next_del_state;
                        self.prev_self_del_state[i] = next_self_del_state;
                    }
                }
                self.del_state[i] = next_del_state;
                self.self_del_state[i] = next_self_del_state;

                if let Ok(cap_index) = cap_index {                    
                    self.create_reward_events_for_publisher(y, self.last_updated_epoch + 1, current_epoch,i, publisher_caps.caps[cap_index].cap)?;
                }      

                i += 1;
        }

        for j in 0..(publisher_caps.num_publishers as usize) {
            if new_publishers[j / 8] & (1 << (j % 8)) == 0 {
                if i == MAX_PUBLISHERS {
                    return err!(IntegrityPoolError::TooManyPublishers);
                }
                self.publishers[i] = publisher_caps.caps[j].pubkey;
                i += 1;
            }
        }

        // for every event that was missed, create a reward event using del_state after update
        // which corresponds to the del_state of all the epochs after last_updated_epoch

        self.num_events += epochs_passed;
        self.last_updated_epoch = current_epoch;

        Ok(())
    }

    fn get_publisher_cap_index(
        publisher: &Pubkey,
        publisher_caps: &PublisherCaps,
    ) -> Result<usize> {
        if *publisher == Pubkey::default() {
            return Ok(0);
        }
        publisher_caps
            .caps
            .binary_search_by_key(&publisher, |cap| &cap.pubkey)
            .map_err(|_| IntegrityPoolError::PublisherNotFound.into())
    }

    pub fn create_reward_events_for_publisher(
        &mut self,
        y: frac64,
        epoch_from: u64,
        epoch_to: u64,
        publisher_index : usize,
        publisher_cap : u64
    ) -> Result<()> {
        for epoch in epoch_from..epoch_to {
            let self_delegation = self.self_del_state[publisher_index].total_delegation;
            let self_eligible_delegation = min(publisher_cap, self_delegation);
            // the order of the operation matters to avoid floating point precision issues
            let self_reward_ratio: frac64 = (FRAC_64_MULTIPLIER_U128
                * u128::from(self_eligible_delegation))
            .checked_div(u128::from(self_delegation))
            .unwrap_or(0)
            .try_into()?;

            let other_delegation = self.del_state[publisher_index].total_delegation;
            let other_eligible_delegation =
                min(publisher_cap - self_eligible_delegation, other_delegation);
            // the order of the operation matters to avoid floating point precision issues
            let other_reward_ratio: frac64 = (FRAC_64_MULTIPLIER_U128
                * u128::from(other_eligible_delegation))
            .checked_div(u128::from(other_delegation))
            .unwrap_or(0)
            .try_into()?;

            self.get_event_mut((self.num_events + epoch - self.last_updated_epoch) as usize)
                .event_data[publisher_index] = PublisherEventData {
                self_reward_ratio,
                other_reward_ratio,
            };
        }
        Ok(())
    }

    pub fn get_publisher_index(&self, publisher: &Pubkey) -> Result<usize> {
        for i in 0..MAX_PUBLISHERS {
            if self.publishers[i] == *publisher {
                return Ok(i);
            }
        }
        err!(IntegrityPoolError::PublisherNotFound)
    }

    pub fn add_delegation(
        &mut self,
        publisher: &Pubkey,
        stake_account_positions_key: &Pubkey,
        amount: u64,
    ) -> Result<()> {
        let index = self.get_publisher_index(publisher)?;
        self.assert_up_to_date()?;

        if stake_account_positions_key == &self.publisher_stake_accounts[index] {
            self.self_del_state[index].positive_delta_delegation += amount;
        } else {
            self.del_state[index].positive_delta_delegation += amount;
        }
        Ok(())
    }

    pub fn remove_delegation(
        &mut self,
        publisher: &Pubkey,
        stake_account_positions_key: &Pubkey,
        amount: u64,
        position_state: PositionState,
    ) -> Result<()> {
        let index = self.get_publisher_index(publisher)?;
        self.assert_up_to_date()?;

        if stake_account_positions_key == &self.publisher_stake_accounts[index] {
            match position_state {
                PositionState::LOCKED => {
                    self.self_del_state[index].negative_delta_delegation += amount;
                }
                PositionState::LOCKING => {
                    self.self_del_state[index].positive_delta_delegation -= amount;
                }
                PositionState::UNLOCKED => {}
                _ => return err!(IntegrityPoolError::UnexpectedPositionState),
            }
        } else {
            match position_state {
                PositionState::LOCKED => {
                    self.del_state[index].negative_delta_delegation += amount;
                }
                PositionState::LOCKING => {
                    self.del_state[index].positive_delta_delegation -= amount;
                }
                PositionState::UNLOCKED => {}
                _ => return err!(IntegrityPoolError::UnexpectedPositionState),
            }
        }
        Ok(())
    }

    pub fn assert_up_to_date(&self) -> Result<()> {
        require_eq!(
            self.last_updated_epoch,
            get_current_epoch()?,
            IntegrityPoolError::OutdatedPublisherAccounting
        );
        Ok(())
    }
}

#[account]
#[derive(BorshSchema)]
pub struct PoolConfig {
    pub pool_data:                Pubkey,
    pub reward_program_authority: Pubkey,
    pub pyth_token_mint:          Pubkey,
    pub y:                        frac64,
}

impl PoolConfig {
    pub const LEN: usize = 1000;
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        anchor_lang::Discriminator,
        publisher_caps::{
            PublisherCap,
            MAX_CAPS,
        },
    };

    #[test]
    #[allow(deprecated)]
    fn test_size() {
        assert!(std::mem::size_of::<PoolData>() + 8 <= PoolData::LEN);
        assert!(
            solana_sdk::borsh0_10::get_packed_len::<PoolConfig>()
                + PoolConfig::discriminator().len()
                <= PoolConfig::LEN
        );
    }

    #[test]
    #[allow(deprecated)]
    fn test_circular_events() {
        let mut pool_data = PoolData {
            last_updated_epoch:       0,
            publishers:               [Pubkey::default(); MAX_PUBLISHERS],
            caps:                     [0; MAX_PUBLISHERS],
            prev_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            del_state:                [DelegationState::default(); MAX_PUBLISHERS],
            prev_self_del_state:      [DelegationState::default(); MAX_PUBLISHERS],
            self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
            events:                   [Event::default(); MAX_EVENTS],
            num_events:               0,
        };

        pool_data.get_event_mut(1).epoch = 123;
        assert_eq!(pool_data.get_event(1 + MAX_EVENTS).epoch, 123);
        assert_eq!(pool_data.get_event(2 + MAX_EVENTS).epoch, 0);
        assert_eq!(pool_data.get_event(1 + 2 * MAX_EVENTS).epoch, 123);
    }

    // #[test]
    // fn test_reward_events() {
    //     let publisher_1 = Pubkey::new_unique();
    //     let mut pool_data = PoolData {
    //         last_updated_epoch:       1,
    //         publishers:               [Pubkey::default(); MAX_PUBLISHERS],
    //         caps:                     [0; MAX_PUBLISHERS],
    //         prev_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
    //         del_state:                [DelegationState::default(); MAX_PUBLISHERS],
    //         prev_self_del_state:      [DelegationState::default(); MAX_PUBLISHERS],
    //         self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
    //         publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
    //         events:                   [Event::default(); MAX_EVENTS],
    //         num_events:               0,
    //     };

    //     let mut caps = [PublisherCap {
    //         pubkey: Pubkey::new_unique(),
    //         cap:    0,
    //     }; MAX_CAPS];

    //     caps[0].pubkey = publisher_1;
    //     caps[0].cap = 150;

    //     for (index, cap) in caps.iter().enumerate() {
    //         pool_data.publishers[index] = cap.pubkey;
    //         pool_data.caps[index] = cap.cap;
    //     }

    //     pool_data.self_del_state[0].total_delegation = 100;
    //     pool_data.del_state[0].total_delegation = 100;

    //     pool_data.create_reward_events_for_publisher(10, 1, 2, 0, 150).unwrap();

    //     assert_eq!(pool_data.events[0].epoch, 1);
    //     assert_eq!(pool_data.events[0].y, 10);
    //     assert_eq!(
    //         pool_data.events[0].event_data[0].self_reward_ratio,
    //         1_000_000
    //     );
    //     assert_eq!(
    //         pool_data.events[0].event_data[0].other_reward_ratio,
    //         500_000
    //     );
    // }

    // #[test]
    // fn test_reward_events_overflow() {
    //     let publisher_1 = Pubkey::new_unique();
    //     let mut pool_data = PoolData {
    //         last_updated_epoch:       1,
    //         publishers:               [Pubkey::default(); MAX_PUBLISHERS],
    //         caps:                     [0; MAX_PUBLISHERS],
    //         prev_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
    //         del_state:                [DelegationState::default(); MAX_PUBLISHERS],
    //         prev_self_del_state:      [DelegationState::default(); MAX_PUBLISHERS],
    //         self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
    //         publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
    //         events:                   [Event::default(); MAX_EVENTS],
    //         num_events:               0,
    //     };

    //     let mut caps = [PublisherCap {
    //         pubkey: Pubkey::new_unique(),
    //         cap:    0,
    //     }; MAX_CAPS];

    //     caps[0].pubkey = publisher_1;
    //     caps[0].cap = 2e18 as u64;

    //     for (index, cap) in caps.iter().enumerate() {
    //         pool_data.publishers[index] = cap.pubkey;
    //         pool_data.caps[index] = cap.cap;
    //     }

    //     pool_data.self_del_state[0].total_delegation = 1e18 as u64;
    //     pool_data.del_state[0].total_delegation = 2e18 as u64;

    //     pool_data.create_reward_events_for_publisher(10, 1, 2, 0, 2e18 as u64).unwrap();

    //     assert_eq!(pool_data.events[0].epoch, 1);
    //     assert_eq!(pool_data.events[0].y, 10);
    //     assert_eq!(
    //         pool_data.events[0].event_data[0].self_reward_ratio,
    //         1_000_000
    //     );
    //     assert_eq!(
    //         pool_data.events[0].event_data[0].other_reward_ratio,
    //         500_000
    //     );
    // }
}
