use {
    super::event::{
        Event,
        PublisherEventData,
    },
    crate::{
        error::IntegrityPoolError,
        utils::{
            clock::time_to_epoch,
            constants::{
                MAX_EVENTS,
                MAX_PUBLISHERS,
            },
            types::{
                frac64,
                BoolArray,
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
    },
    std::{
        cmp::min,
        convert::{
            TryFrom,
            TryInto,
        },
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
    pub total_delegation: u64,
    // amount of delegate/undelegate during the epoch
    // will take effect at the end of the epoch
    pub delta_delegation: i64,
}

#[account(zero_copy)]
#[repr(C)]
pub struct PoolData {
    pub last_updated_epoch:       u64,
    pub publishers:               [Pubkey; MAX_PUBLISHERS],
    pub del_state:                [DelegationState; MAX_PUBLISHERS],
    pub self_del_state:           [DelegationState; MAX_PUBLISHERS],
    pub publisher_stake_accounts: [Pubkey; MAX_PUBLISHERS],
    pub events:                   [Event; MAX_EVENTS],
    pub num_events:               u64,
    pub num_slash_events:         [u64; MAX_PUBLISHERS],
    pub delegation_fees:          [frac64; MAX_PUBLISHERS],
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

    // calculate the reward in pyth with decimals
    // returns (delegator_reward, publisher_reward)
    pub fn calculate_reward(
        &self,
        from_epoch: u64,
        stake_account_positions_key: &Pubkey,
        positions: &staking::state::positions::DynamicPositionArray,
        publisher: &Pubkey,
        current_epoch: u64,
    ) -> Result<(frac64, frac64)> {
        self.assert_up_to_date(current_epoch)?;

        let publisher_index = self.get_publisher_index(publisher)?;

        let mut delegator_reward: frac64 = 0;
        let mut publisher_reward: frac64 = 0;

        let mut event_amounts = [0_u64; MAX_EVENTS];

        for i in 0..positions.get_position_capacity() {
            let position = match positions.read_position(i)? {
                Some(position) => position,
                None => continue,
            };

            match position.target_with_parameters {
                TargetWithParameters::IntegrityPool {
                    publisher: ref position_publisher,
                } if position_publisher == publisher => {}
                _ => continue,
            }

            let mut last_event_index: usize = self.num_events.try_into()?;
            loop {
                // prevent infinite loop and double counting events
                // by breaking the loop when visiting all events
                if usize::try_from(self.num_events)? == last_event_index + MAX_EVENTS {
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

                let position_state = position.get_current_position(event.epoch)?;

                match position_state {
                    PositionState::LOCKED | PositionState::PREUNLOCKING => {}
                    PositionState::UNLOCKED | PositionState::LOCKING | PositionState::UNLOCKING => {
                        continue;
                    }
                }
                event_amounts[last_event_index % MAX_EVENTS] += position.amount;
            }
        }

        for (i, amount) in event_amounts.iter().enumerate() {
            let event = self.get_event(i);
            let (delegator_reward_for_event, publisher_reward_for_event) = event.calculate_reward(
                *amount,
                publisher_index,
                &self.publisher_stake_accounts[publisher_index] == stake_account_positions_key,
            )?;

            delegator_reward += delegator_reward_for_event;
            publisher_reward += publisher_reward_for_event;
        }

        Ok((delegator_reward, publisher_reward))
    }


    pub fn advance(
        &mut self,
        publisher_caps: &PublisherCaps,
        y: frac64,
        current_epoch: u64,
    ) -> Result<()> {
        let mut existing_publishers = BoolArray::new(MAX_CAPS);

        require_eq!(
            publisher_caps.is_verified,
            1,
            IntegrityPoolError::UnverifiedPublisherCaps
        );

        require_gt!(
            current_epoch,
            self.last_updated_epoch,
            IntegrityPoolError::PoolDataAlreadyUpToDate
        );
        require_eq!(
            current_epoch,
            time_to_epoch(publisher_caps.publish_time())?,
            IntegrityPoolError::OutdatedPublisherCaps
        );

        for epoch in self.last_updated_epoch..current_epoch {
            let event =
                self.get_event_mut((self.num_events + epoch - self.last_updated_epoch).try_into()?);
            event.epoch = epoch;
            event.y = y;
        }

        let epochs_passed = current_epoch - self.last_updated_epoch;
        let mut i = 0;

        while i < MAX_PUBLISHERS && self.publishers[i] != Pubkey::default() {
            let cap_index = publisher_caps
                .caps()
                .binary_search_by_key(&self.publishers[i], |cap| cap.pubkey);


            let publisher_cap = match cap_index {
                Ok(cap_index) => {
                    existing_publishers.set(cap_index);
                    publisher_caps.get_cap(cap_index).cap
                }
                Err(_) => 0,
            };

            // create the reward event for last_updated_epoch using current del_state before
            // updating which corresponds to del_state at the last_updated_epoch
            self.create_reward_events_for_publisher(
                self.last_updated_epoch,
                self.last_updated_epoch + 1,
                i,
                publisher_cap,
            )?;

            self.del_state[i] = DelegationState {
                total_delegation: (TryInto::<i64>::try_into(self.del_state[i].total_delegation)?
                    + self.del_state[i].delta_delegation)
                    .try_into()?,
                delta_delegation: 0,
            };

            self.self_del_state[i] = DelegationState {
                total_delegation: (TryInto::<i64>::try_into(
                    self.self_del_state[i].total_delegation,
                )? + self.self_del_state[i].delta_delegation)
                    .try_into()?,
                delta_delegation: 0,
            };

            // for every event that was missed, create a reward event using del_state after update
            // which corresponds to the del_state of all the epochs after last_updated_epoch
            self.create_reward_events_for_publisher(
                self.last_updated_epoch + 1,
                current_epoch,
                i,
                publisher_cap,
            )?;

            i += 1;
        }

        for j in 0..publisher_caps.num_publishers() as usize {
            // Silently ignore if there are more publishers than MAX_PUBLISHERS
            if !existing_publishers.get(j) && i < MAX_PUBLISHERS {
                self.publishers[i] = publisher_caps.get_cap(j).pubkey;
                i += 1;
            }
        }

        self.num_events += epochs_passed;
        self.last_updated_epoch = current_epoch;

        Ok(())
    }

    pub fn create_reward_events_for_publisher(
        &mut self,
        epoch_from: u64,
        epoch_to: u64,
        publisher_index: usize,
        publisher_cap: u64,
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

            self.get_event_mut((self.num_events + epoch - self.last_updated_epoch).try_into()?)
                .event_data[publisher_index] = PublisherEventData {
                self_reward_ratio,
                other_reward_ratio,
                delegation_fee: self.delegation_fees[publisher_index],
            };
        }
        Ok(())
    }

    pub fn get_publisher_index(&self, publisher: &Pubkey) -> Result<usize> {
        if *publisher == Pubkey::default() {
            return err!(IntegrityPoolError::InvalidPublisher);
        }

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
        current_epoch: u64,
    ) -> Result<()> {
        let index = self.get_publisher_index(publisher)?;
        self.assert_up_to_date(current_epoch)?;

        let amount_i64: i64 = amount.try_into()?;

        if stake_account_positions_key == &self.publisher_stake_accounts[index] {
            self.self_del_state[index].delta_delegation += amount_i64;
        } else {
            self.del_state[index].delta_delegation += amount_i64;
        }
        Ok(())
    }

    pub fn remove_delegation(
        &mut self,
        publisher: &Pubkey,
        stake_account_positions_key: &Pubkey,
        amount: u64,
        position_state: PositionState,
        current_epoch: u64,
    ) -> Result<()> {
        let index = self.get_publisher_index(publisher)?;
        self.assert_up_to_date(current_epoch)?;

        let amount_i64: i64 = amount.try_into()?;

        if stake_account_positions_key == &self.publisher_stake_accounts[index] {
            match position_state {
                PositionState::LOCKED | PositionState::LOCKING => {
                    self.self_del_state[index].delta_delegation -= amount_i64;
                }
                PositionState::UNLOCKED => {}
                _ => return err!(IntegrityPoolError::UnexpectedPositionState),
            }
        } else {
            match position_state {
                PositionState::LOCKED | PositionState::LOCKING => {
                    self.del_state[index].delta_delegation -= amount_i64;
                }
                PositionState::UNLOCKED => {}
                _ => return err!(IntegrityPoolError::UnexpectedPositionState),
            }
        }
        Ok(())
    }

    pub fn apply_slash(
        &mut self,
        publisher: &Pubkey,
        stake_account_positions_key: &Pubkey,
        locked_slashed: u64,
        preunlocking_slashed: u64,
        current_epoch: u64,
    ) -> Result<()> {
        self.assert_up_to_date(current_epoch)?;

        let publisher_index = self.get_publisher_index(publisher)?;

        let del_state = match publisher {
            _ if self.publisher_stake_accounts[publisher_index] == *stake_account_positions_key => {
                &mut self.self_del_state[publisher_index]
            }
            _ => &mut self.del_state[publisher_index],
        };

        del_state.total_delegation -= locked_slashed + preunlocking_slashed;
        del_state.delta_delegation += TryInto::<i64>::try_into(preunlocking_slashed)?;

        Ok(())
    }

    pub fn assert_up_to_date(&self, current_epoch: u64) -> Result<()> {
        require_eq!(
            self.last_updated_epoch,
            current_epoch,
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
        crate::{
            state::event::PublisherEventData,
            utils::types::FRAC_64_MULTIPLIER,
        },
        anchor_lang::Discriminator,
        publisher_caps::{
            PublisherCap,
            MAX_CAPS,
        },
        staking::state::positions::DynamicPositionArrayAccount,
    };

    #[test]
    #[allow(deprecated)]
    fn test_size() {
        assert!(std::mem::size_of::<PoolData>() + 8 <= PoolData::LEN);
        assert!(
            anchor_lang::solana_program::borsh0_10::get_packed_len::<PoolConfig>()
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
            del_state:                [DelegationState::default(); MAX_PUBLISHERS],
            self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
            events:                   [Event::default(); MAX_EVENTS],
            num_events:               0,
            num_slash_events:         [0; MAX_PUBLISHERS],
            delegation_fees:          [0; MAX_PUBLISHERS],
        };

        pool_data.get_event_mut(1).epoch = 123;
        assert_eq!(pool_data.get_event(1 + MAX_EVENTS).epoch, 123);
        assert_eq!(pool_data.get_event(2 + MAX_EVENTS).epoch, 0);
        assert_eq!(pool_data.get_event(1 + 2 * MAX_EVENTS).epoch, 123);
    }

    #[test]
    fn test_calculate_reward() {
        let mut pool_data = PoolData {
            last_updated_epoch:       2,
            publishers:               [Pubkey::default(); MAX_PUBLISHERS],
            del_state:                [DelegationState::default(); MAX_PUBLISHERS],
            self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
            events:                   [Event::default(); MAX_EVENTS],
            num_events:               0,
            num_slash_events:         [0; MAX_PUBLISHERS],
            delegation_fees:          [0; MAX_PUBLISHERS],
        };

        let publisher_key = Pubkey::new_unique();
        let publisher_index = 123;
        pool_data.publisher_stake_accounts[publisher_index] = publisher_key;
        pool_data.publishers[publisher_index] = publisher_key;


        let mut event = Event {
            epoch:       1,
            y:           FRAC_64_MULTIPLIER / 10, // 10%
            extra_space: [0; 7],
            event_data:  [PublisherEventData::default(); MAX_PUBLISHERS],
        };

        event.event_data[publisher_index] = PublisherEventData {
            self_reward_ratio:  FRAC_64_MULTIPLIER,     // 1
            other_reward_ratio: FRAC_64_MULTIPLIER / 2, // 1/2
            delegation_fee:     0,
        };

        for i in 0..10 {
            pool_data.events[i] = event;
            pool_data.events[i].epoch = (i + 1) as u64;
        }

        let mut stake_positions_account = DynamicPositionArrayAccount::default();
        let mut positions = stake_positions_account.to_dynamic_position_array();
        // this position should be ignored (wrong target)
        positions
            .write_position(
                0,
                &staking::state::positions::Position {
                    activation_epoch:       1,
                    amount:                 12 * FRAC_64_MULTIPLIER,
                    target_with_parameters: TargetWithParameters::Voting,
                    unlocking_start:        None,
                },
            )
            .unwrap();
        // this position should be ignored (wrong publisher)
        positions
            .write_position(
                1,
                &staking::state::positions::Position {
                    activation_epoch:       1,
                    amount:                 23 * FRAC_64_MULTIPLIER,
                    target_with_parameters: TargetWithParameters::IntegrityPool {
                        publisher: Pubkey::new_unique(),
                    },
                    unlocking_start:        None,
                },
            )
            .unwrap();
        // this position should be included from epoch 1
        positions
            .write_position(
                2,
                &staking::state::positions::Position {
                    activation_epoch:       1,
                    amount:                 40 * FRAC_64_MULTIPLIER,
                    target_with_parameters: TargetWithParameters::IntegrityPool {
                        publisher: publisher_key,
                    },
                    unlocking_start:        None,
                },
            )
            .unwrap();
        // this position should be included from epoch 2
        positions
            .write_position(
                3,
                &staking::state::positions::Position {
                    activation_epoch:       2,
                    amount:                 60 * FRAC_64_MULTIPLIER,
                    target_with_parameters: TargetWithParameters::IntegrityPool {
                        publisher: publisher_key,
                    },
                    unlocking_start:        None,
                },
            )
            .unwrap();

        pool_data.last_updated_epoch = 2;
        pool_data.num_events = 1;
        let (delegator_reward, _) = pool_data
            .calculate_reward(1, &publisher_key, &positions, &publisher_key, 2)
            .unwrap();

        // 40 PYTH (amount) * 1 (self_reward_ratio) * 10% (y) = 4 PYTH
        assert_eq!(delegator_reward, 4 * FRAC_64_MULTIPLIER);

        pool_data.num_events = 2;
        pool_data.last_updated_epoch = 3;
        let (delegator_reward, _) = pool_data
            .calculate_reward(2, &publisher_key, &positions, &publisher_key, 3)
            .unwrap();

        // 40 + 60 PYTH (amount) * 1 (self_reward_ratio) * 10% (y) = 10 PYTH
        assert_eq!(delegator_reward, 10 * FRAC_64_MULTIPLIER);

        pool_data.num_events = 10;
        pool_data.last_updated_epoch = 11;
        let (delegator_reward, _) = pool_data
            .calculate_reward(1, &publisher_key, &positions, &publisher_key, 11)
            .unwrap();

        assert_eq!(delegator_reward, 94 * FRAC_64_MULTIPLIER);


        // test many events
        pool_data.num_events = 100;
        pool_data.last_updated_epoch = 101;
        for i in 0..MAX_EVENTS {
            pool_data.events[i] = event;
        }
        for i in 0..100 {
            pool_data.get_event_mut(i).epoch = (i + 1) as u64;
        }

        let (delegator_reward, _) = pool_data
            .calculate_reward(1, &publisher_key, &positions, &publisher_key, 101)
            .unwrap();

        assert_eq!(
            delegator_reward,
            (MAX_EVENTS as u64) * 10 * FRAC_64_MULTIPLIER
        );
    }

    #[test]
    fn test_reward_events() {
        let publisher_1 = Pubkey::new_unique();
        let mut pool_data = PoolData {
            last_updated_epoch:       1,
            publishers:               [Pubkey::default(); MAX_PUBLISHERS],
            del_state:                [DelegationState::default(); MAX_PUBLISHERS],
            self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
            events:                   [Event::default(); MAX_EVENTS],
            num_events:               0,
            num_slash_events:         [0; MAX_PUBLISHERS],
            delegation_fees:          [0; MAX_PUBLISHERS],
        };

        let mut caps = [PublisherCap {
            pubkey: Pubkey::new_unique(),
            cap:    0,
        }; MAX_CAPS];

        caps[0].pubkey = publisher_1;
        caps[0].cap = 150;

        pool_data.self_del_state[0].total_delegation = 100;
        pool_data.del_state[0].total_delegation = 100;

        for (index, cap) in caps.iter().enumerate() {
            pool_data.publishers[index] = cap.pubkey;
            pool_data
                .create_reward_events_for_publisher(1, 2, index, cap.cap)
                .unwrap();
        }

        assert_eq!(
            pool_data.events[0].event_data[0].self_reward_ratio,
            1_000_000
        );
        assert_eq!(
            pool_data.events[0].event_data[0].other_reward_ratio,
            500_000
        );
    }

    #[test]
    fn test_reward_events_overflow() {
        let publisher_1 = Pubkey::new_unique();
        let mut pool_data = PoolData {
            last_updated_epoch:       1,
            publishers:               [Pubkey::default(); MAX_PUBLISHERS],
            del_state:                [DelegationState::default(); MAX_PUBLISHERS],
            self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
            events:                   [Event::default(); MAX_EVENTS],
            num_events:               0,
            num_slash_events:         [0; MAX_PUBLISHERS],
            delegation_fees:          [0; MAX_PUBLISHERS],
        };

        let mut caps = [PublisherCap {
            pubkey: Pubkey::new_unique(),
            cap:    0,
        }; MAX_CAPS];

        caps[0].pubkey = publisher_1;
        caps[0].cap = 2e18 as u64;
        pool_data.self_del_state[0].total_delegation = 1e18 as u64;
        pool_data.del_state[0].total_delegation = 2e18 as u64;

        for (index, cap) in caps.iter().enumerate() {
            pool_data.publishers[index] = cap.pubkey;
            pool_data
                .create_reward_events_for_publisher(1, 2, index, cap.cap)
                .unwrap();
        }

        assert_eq!(
            pool_data.events[0].event_data[0].self_reward_ratio,
            1_000_000
        );
        assert_eq!(
            pool_data.events[0].event_data[0].other_reward_ratio,
            500_000
        );
    }

    #[test]
    fn test_delegation() {
        let publisher_1 = Pubkey::new_unique();
        let publisher_stake_account = Pubkey::new_unique();
        let mut pool_data = PoolData {
            last_updated_epoch:       2,
            publishers:               [Pubkey::default(); MAX_PUBLISHERS],
            del_state:                [DelegationState::default(); MAX_PUBLISHERS],
            self_del_state:           [DelegationState::default(); MAX_PUBLISHERS],
            publisher_stake_accounts: [Pubkey::default(); MAX_PUBLISHERS],
            events:                   [Event::default(); MAX_EVENTS],
            num_events:               0,
            num_slash_events:         [0; MAX_PUBLISHERS],
            delegation_fees:          [0; MAX_PUBLISHERS],
        };

        pool_data.publishers[0] = publisher_1;
        pool_data.publisher_stake_accounts[0] = publisher_stake_account;

        pool_data
            .add_delegation(&publisher_1, &publisher_stake_account, 123, 2)
            .unwrap();

        assert_eq!(pool_data.self_del_state[0].total_delegation, 0);
        assert_eq!(pool_data.self_del_state[0].delta_delegation, 123);

        pool_data
            .add_delegation(&publisher_1, &publisher_stake_account, 222, 2)
            .unwrap();

        assert_eq!(pool_data.self_del_state[0].total_delegation, 0);
        assert_eq!(pool_data.self_del_state[0].delta_delegation, 123 + 222);


        pool_data
            .add_delegation(&publisher_1, &Pubkey::new_unique(), 321, 2)
            .unwrap();

        assert_eq!(pool_data.del_state[0].total_delegation, 0);
        assert_eq!(pool_data.del_state[0].delta_delegation, 321);

        pool_data
            .add_delegation(&publisher_1, &Pubkey::new_unique(), 222, 2)
            .unwrap();

        assert_eq!(pool_data.del_state[0].total_delegation, 0);
        assert_eq!(pool_data.del_state[0].delta_delegation, 321 + 222);

        pool_data
            .remove_delegation(
                &publisher_1,
                &publisher_stake_account,
                111,
                PositionState::LOCKING,
                2,
            )
            .unwrap();

        assert_eq!(pool_data.self_del_state[0].total_delegation, 0);
        assert_eq!(
            pool_data.self_del_state[0].delta_delegation,
            123 + 222 - 111
        );

        pool_data
            .remove_delegation(
                &publisher_1,
                &publisher_stake_account,
                111,
                PositionState::LOCKED,
                2,
            )
            .unwrap();

        assert_eq!(pool_data.self_del_state[0].total_delegation, 0);
        assert_eq!(
            pool_data.self_del_state[0].delta_delegation,
            123 + 222 - 111 - 111
        );

        // unlocking state should not affect the delta delegation
        pool_data
            .remove_delegation(
                &publisher_1,
                &publisher_stake_account,
                456,
                PositionState::UNLOCKED,
                2,
            )
            .unwrap();

        assert_eq!(pool_data.self_del_state[0].total_delegation, 0);
        assert_eq!(
            pool_data.self_del_state[0].delta_delegation,
            123 + 222 - 111 - 111
        );

        let res = pool_data.remove_delegation(
            &publisher_1,
            &publisher_stake_account,
            456,
            PositionState::PREUNLOCKING,
            2,
        );

        assert_eq!(
            res.unwrap_err(),
            IntegrityPoolError::UnexpectedPositionState.into()
        );

        let res = pool_data.remove_delegation(
            &publisher_1,
            &publisher_stake_account,
            456,
            PositionState::UNLOCKING,
            2,
        );

        assert_eq!(
            res.unwrap_err(),
            IntegrityPoolError::UnexpectedPositionState.into()
        );
    }
}
