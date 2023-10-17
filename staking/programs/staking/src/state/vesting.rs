#![allow(clippy::unused_unit)]

use {
    crate::error::ErrorCode,
    anchor_lang::{
        prelude::{
            borsh::BorshSchema,
            *,
        },
        solana_program::wasm_bindgen,
    },
    std::convert::TryInto,
};

// We would like to say:
// type UnixTimestamp = i64;
// as in solana_program::clock::UnixTimestamp
// But Anchor does not allow it

/// Represents how a given initial balance vests over time
/// It is unit-less, but units must be consistent
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema)]
pub enum VestingSchedule {
    /// No vesting, i.e. balance is fully vested at all time
    FullyVested,
    /// Every (period_duration), (initial_balance/num_periods) vests
    PeriodicVesting {
        initial_balance: u64,
        start_date:      i64,
        period_duration: u64,
        num_periods:     u64,
    },
    PeriodicVestingAfterListing {
        initial_balance: u64,
        period_duration: u64,
        num_periods:     u64,
    },
}

#[wasm_bindgen]
#[derive(PartialEq, Eq, Debug)]
pub struct VestingEvent {
    pub time:   i64,
    pub amount: u64,
}

impl VestingSchedule {
    /// For a vesting schedule and the current time (in the same units used in the vesting
    /// schedule), gets the _unvested_ amount. If the unvested balance is fractional, it rounds
    /// the unvested amount up. It tries to be careful about overflow.
    pub fn get_unvested_balance(
        &self,
        current_time: i64,
        token_list_time: Option<i64>,
    ) -> Result<u64> {
        match (*self, token_list_time) {
            (VestingSchedule::FullyVested, _) => Ok(0),
            (
                VestingSchedule::PeriodicVesting {
                    initial_balance,
                    start_date,
                    period_duration,
                    num_periods,
                },
                _,
            ) => Ok(VestingSchedule::periodic_vesting_helper(
                current_time,
                initial_balance,
                start_date,
                period_duration,
                num_periods,
            )),
            (
                VestingSchedule::PeriodicVestingAfterListing {
                    initial_balance,
                    period_duration,
                    num_periods,
                },
                Some(list_time),
            ) => Ok(VestingSchedule::periodic_vesting_helper(
                current_time,
                initial_balance,
                list_time,
                period_duration,
                num_periods,
            )),
            (
                VestingSchedule::PeriodicVestingAfterListing {
                    initial_balance, ..
                },
                None,
            ) => Ok(initial_balance),
        }
    }

    pub fn get_next_vesting(
        &self,
        current_time: i64,
        token_list_time: Option<i64>,
    ) -> Result<Option<VestingEvent>> {
        match (*self, token_list_time) {
            (VestingSchedule::FullyVested, _) => Ok(None),
            (
                VestingSchedule::PeriodicVesting {
                    initial_balance,
                    start_date,
                    period_duration,
                    num_periods,
                },
                _,
            ) => VestingSchedule::next_vesting_helper(
                current_time,
                initial_balance,
                start_date,
                period_duration,
                num_periods,
            ),
            (
                VestingSchedule::PeriodicVestingAfterListing {
                    initial_balance,
                    period_duration,
                    num_periods,
                },
                Some(list_time),
            ) => VestingSchedule::next_vesting_helper(
                current_time,
                initial_balance,
                list_time,
                period_duration,
                num_periods,
            ),
            (VestingSchedule::PeriodicVestingAfterListing { .. }, None) => {
                // No vesting events until the token listing date is determined.
                Ok(None)
            }
        }
    }

    /// This is essentially the unvested balance calculation for periodic vesting.
    /// Factor this out because linear vesting is the same as periodic vesting with a period of 1
    fn periodic_vesting_helper(
        current_time: i64,
        initial_balance: u64,
        start_date: i64,
        period_duration: u64,
        num_periods: u64,
    ) -> u64 {
        if current_time < start_date {
            initial_balance
        } else {
            let time_passed: u64 = current_time
                .checked_sub(start_date)
                .unwrap()
                .try_into()
                .unwrap();
            let periods_passed = time_passed / period_duration; // Definitely round this one down

            if periods_passed >= num_periods {
                0
            } else {
                // Amount that vests per period is (initial_balance / num_periods),
                // but again, we need to do the math in 128 bit precision and make sure
                // we round the vested balance down, so as to round the unvested balance up.

                // Since we're in this branch, periods_passed <= num_periods, so vested <=
                // initial_balance. Thus we know it can fit in a u64, so the unwrap
                // can't fail.
                let vested = (((periods_passed as u128) * (initial_balance as u128))
                    / (num_periods as u128))
                    .try_into()
                    .unwrap();
                // We also know then 0 <= vested <= initial_balance, so this unwrap can't fail
                // either I still feel safer with the unwrap though
                initial_balance.checked_sub(vested).unwrap()
            }
        }
    }

    /// Calculate the time when the next token vest occurs for a periodic vesting schedule where
    /// vesting begins on `start_date`.
    fn next_vesting_helper(
        current_time: i64,
        initial_balance: u64,
        start_date: i64,
        period_duration: u64,
        num_periods: u64,
    ) -> Result<Option<VestingEvent>> {
        let mut periods_passed = 0;
        if current_time >= start_date {
            let time_passed: u64 = current_time
                .checked_sub(start_date)
                .ok_or_else(|| error!(ErrorCode::GenericOverflow))?
                .try_into()
                .map_err(|_| error!(ErrorCode::GenericOverflow))?;

            periods_passed = time_passed / period_duration;
        }

        if periods_passed >= num_periods {
            return Ok(None);
        }

        let start_of_next_period = start_date
            + TryInto::<i64>::try_into(
                periods_passed
                    .checked_add(1)
                    .ok_or_else(|| error!(ErrorCode::GenericOverflow))?
                    .checked_mul(period_duration)
                    .ok_or_else(|| error!(ErrorCode::GenericOverflow))?,
            )
            .map_err(|_| error!(ErrorCode::GenericOverflow))?;

        let current_vested: u64 = (((periods_passed as u128) * (initial_balance as u128))
            / (num_periods as u128))
            .try_into()
            .map_err(|_| error!(ErrorCode::GenericOverflow))?;

        let periods_passed_incremented = periods_passed
            .checked_add(1)
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?;

        let next_period_vested: u64 = (((periods_passed_incremented as u128)
            * (initial_balance as u128))
            / (num_periods as u128))
            .try_into()
            .map_err(|_| error!(ErrorCode::GenericOverflow))?;

        let amount: u64 = next_period_vested
            .checked_sub(current_vested)
            .ok_or_else(|| error!(ErrorCode::GenericOverflow))?;

        Ok(Some(VestingEvent {
            time: start_of_next_period,
            amount,
        }))
    }

    pub fn split_vesting_schedule(
        &self,
        remaining_amount: u64,
        transferred_amount: u64,
        total_amount: u64,
    ) -> Result<(VestingSchedule, VestingSchedule)> {
        require!(
            transferred_amount
                .checked_add(remaining_amount)
                .ok_or(ErrorCode::Other)?
                == total_amount,
            ErrorCode::SanityCheckFailed
        );
        match self {
            VestingSchedule::FullyVested => {
                Ok((VestingSchedule::FullyVested, VestingSchedule::FullyVested))
            }
            VestingSchedule::PeriodicVesting {
                initial_balance,
                start_date,
                period_duration,
                num_periods,
            } => Ok((
                VestingSchedule::PeriodicVesting {
                    initial_balance: ((remaining_amount as u128) * (*initial_balance as u128)
                        / (total_amount as u128)) as u64,
                    start_date:      *start_date,
                    period_duration: *period_duration,
                    num_periods:     *num_periods,
                },
                VestingSchedule::PeriodicVesting {
                    initial_balance: ((transferred_amount as u128) * (*initial_balance as u128)
                        / (total_amount as u128)) as u64,
                    start_date:      *start_date,
                    period_duration: *period_duration,
                    num_periods:     *num_periods,
                },
            )),
            VestingSchedule::PeriodicVestingAfterListing {
                initial_balance,
                period_duration,
                num_periods,
            } => Ok((
                VestingSchedule::PeriodicVestingAfterListing {
                    initial_balance: ((remaining_amount as u128) * (*initial_balance as u128)
                        / (total_amount as u128)) as u64,
                    period_duration: *period_duration,
                    num_periods:     *num_periods,
                },
                VestingSchedule::PeriodicVestingAfterListing {
                    initial_balance: ((transferred_amount as u128) * (*initial_balance as u128)
                        / (total_amount as u128)) as u64,
                    period_duration: *period_duration,
                    num_periods:     *num_periods,
                },
            )),
        }
    }
}

#[cfg(test)]
pub mod tests {
    use {
        crate::state::vesting::{
            VestingEvent,
            VestingSchedule,
        },
        std::convert::TryInto,
    };

    #[test]
    fn test_novesting() {
        let v = VestingSchedule::FullyVested;
        assert_eq!(v.get_unvested_balance(0, None).unwrap(), 0);
        assert_eq!(v.get_next_vesting(0, None).unwrap(), None);
        assert_eq!(v.get_unvested_balance(10, None).unwrap(), 0);
        assert_eq!(v.get_next_vesting(10, None).unwrap(), None);
    }

    #[test]
    fn test_linear() {
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 20,
            start_date:      5,
            period_duration: 1,
            num_periods:     6,
        };
        for t in 0..14 {
            if t <= 4 {
                assert_eq!(v.get_unvested_balance(t, None).unwrap(), 20);
                assert_eq!(
                    v.get_next_vesting(t, None).unwrap(),
                    Some(VestingEvent {
                        time:   6,
                        amount: 3,
                    })
                );
            } else if t <= 10 {
                // Linearly interpolate between (5, 20) and (11, 0)
                let locked_float = 20.0 + (t - 5) as f64 * -20.0 / 6.0;
                assert_eq!(
                    v.get_unvested_balance(t, None).unwrap(),
                    locked_float.ceil() as u64
                );
                assert_eq!(
                    v.get_next_vesting(t, None).unwrap(),
                    Some(VestingEvent {
                        time:   t + 1,
                        amount: v.get_unvested_balance(t, None).unwrap()
                            - v.get_unvested_balance(t + 1, None).unwrap(),
                    })
                );
            } else {
                // Linearly interpolate between (5, 20) and (11, 0)
                let locked_float = 0;
                assert_eq!(v.get_unvested_balance(t, None).unwrap(), locked_float);
                assert_eq!(v.get_next_vesting(t, None).unwrap(), None);
            }
        }
    }

    #[test]
    fn test_cliff() {
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 20,
            start_date:      0,
            period_duration: 5,
            num_periods:     1,
        };
        assert_eq!(v.get_unvested_balance(0, None).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(0, None).unwrap(),
            Some(VestingEvent {
                time:   5,
                amount: 20,
            })
        );
        assert_eq!(v.get_unvested_balance(4, None).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(4, None).unwrap(),
            Some(VestingEvent {
                time:   5,
                amount: 20,
            })
        );
        // This one could go either way, but say (t>=cliff_date) has vested
        assert_eq!(v.get_unvested_balance(5, None).unwrap(), 0);
        assert_eq!(v.get_next_vesting(5, None).unwrap(), None);
        assert_eq!(v.get_unvested_balance(100, None).unwrap(), 0);
        assert_eq!(v.get_next_vesting(100, None).unwrap(), None);
    }

    #[test]
    fn test_period() {
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 20,
            start_date:      5,
            period_duration: 3,
            num_periods:     7,
        };
        assert_eq!(v.get_unvested_balance(0, None).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(0, None).unwrap(),
            Some(VestingEvent {
                time:   8,
                amount: 2,
            })
        );
        assert_eq!(v.get_unvested_balance(5, None).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(5, None).unwrap(),
            Some(VestingEvent {
                time:   8,
                amount: 2,
            })
        );
        assert_eq!(v.get_unvested_balance(5 + 7 * 3, None).unwrap(), 0);
        assert_eq!(v.get_next_vesting(5 + 7 * 3, None).unwrap(), None);
        assert_eq!(v.get_unvested_balance(100, None).unwrap(), 0);
        assert_eq!(v.get_next_vesting(100, None).unwrap(), None);
        let mut t = 5;
        for period in 0..8 {
            let locked_for_period = v.get_unvested_balance(t, None).unwrap();
            // Linearly interpolate from (0, 20) to (7, 0)
            let locked_float = f64::max(20.0 * (1.0 - period as f64 / 7.0), 0.0);
            assert_eq!(locked_for_period, locked_float.ceil() as u64);
            for _t_in_period in 0..3 {
                assert_eq!(v.get_unvested_balance(t, None).unwrap(), locked_for_period);
                if period < 7 {
                    assert_eq!(
                        v.get_next_vesting(t, None).unwrap(),
                        Some(VestingEvent {
                            time:   t + 3 - _t_in_period,
                            amount: v.get_unvested_balance(t, None).unwrap()
                                - v.get_unvested_balance(t + 3, None).unwrap(),
                        })
                    );
                } else {
                    assert_eq!(v.get_next_vesting(t, None).unwrap(), None)
                }
                t += 1;
            }
        }
    }

    #[test]
    fn test_period_after_listing() {
        let v = VestingSchedule::PeriodicVestingAfterListing {
            initial_balance: 20,
            period_duration: 3,
            num_periods:     7,
        };
        assert_eq!(v.get_unvested_balance(0, None).unwrap(), 20);
        assert_eq!(v.get_unvested_balance(5, None).unwrap(), 20);
        assert_eq!(v.get_unvested_balance(5 + 7 * 3, None).unwrap(), 20);
        assert_eq!(v.get_unvested_balance(4, Some(5)).unwrap(), 20);
        assert_eq!(v.get_unvested_balance(5 + 7 * 3, Some(5)).unwrap(), 0);
        assert_eq!(v.get_unvested_balance(5 + 7 * 3, Some(6)).unwrap(), 3);
        assert_eq!(
            v.get_next_vesting(4 + 7 * 3, Some(5)).unwrap(),
            Some(VestingEvent {
                time:   26,
                amount: 3,
            })
        );
        assert_eq!(v.get_next_vesting(4 + 7 * 3, None).unwrap(), None);
        assert_eq!(v.get_unvested_balance(100, None).unwrap(), 20);

        let mut t = 5;
        for period in 0..8 {
            assert_eq!(20, v.get_unvested_balance(t, None).unwrap());
            let locked_for_period = v.get_unvested_balance(t, Some(5)).unwrap();
            // Linearly interpolate from (0, 20) to (7, 0)
            let locked_float = f64::max(20.0 * (1.0 - period as f64 / 7.0), 0.0);
            assert_eq!(locked_for_period, locked_float.ceil() as u64);
            for _t_in_period in 0..3 {
                assert_eq!(
                    v.get_unvested_balance(t, Some(5)).unwrap(),
                    locked_for_period
                );
                if period < 7 {
                    assert_eq!(
                        v.get_next_vesting(t, Some(5)).unwrap(),
                        Some(VestingEvent {
                            time:   t + 3 - _t_in_period,
                            amount: v.get_unvested_balance(t, Some(5)).unwrap()
                                - v.get_unvested_balance(t + 3, Some(5)).unwrap(),
                        })
                    );
                } else {
                    assert_eq!(v.get_next_vesting(t, Some(5)).unwrap(), None)
                }
                t += 1;
            }
        }
    }

    #[test]
    #[should_panic]
    fn test_overflow() {
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 1_000_000_000,
            start_date:      -9223372036854775264,
            period_duration: 1,
            num_periods:     1 << 63,
        };
        v.get_unvested_balance(9223372036854775264, None).unwrap();
    }

    #[test]
    fn test_overflow2() {
        // Invariant: get_unvested_balance always returns something between 0 and initial_balance
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 1_000_000_000,
            start_date:      -(1 << 60),
            period_duration: 1,
            num_periods:     1 << 62,
        };
        let value = v.get_unvested_balance(1 << 60, None).unwrap();
        assert!(value <= 1_000_000_000);
        assert_eq!(
            v.get_next_vesting(1 << 60, None).unwrap(),
            Some(VestingEvent {
                time:   (1 << 60) + 1,
                amount: 0,
            })
        )
    }

    #[test]
    fn default_pyth_vesting() {
        let one_month = 61 * 3600 * 12;
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 1_000,
            start_date:      0,
            period_duration: one_month,
            num_periods:     72,
        };

        let tokens_per_period = 1_000 / 72;

        let value = v.get_unvested_balance(1, None).unwrap();
        assert_eq!(value, 1000);
        assert_eq!(
            v.get_next_vesting(1, None).unwrap(),
            Some(VestingEvent {
                time:   one_month.try_into().unwrap(),
                amount: 13,
            })
        );

        let value = v
            .get_unvested_balance((one_month - 1).try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 1000);
        assert_eq!(
            v.get_next_vesting((one_month - 1).try_into().unwrap(), None)
                .unwrap(),
            Some(VestingEvent {
                time:   one_month.try_into().unwrap(),
                amount: 13,
            })
        );

        let value = v
            .get_unvested_balance(one_month.try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 1000 - tokens_per_period);
        assert_eq!(
            v.get_next_vesting(one_month.try_into().unwrap(), None)
                .unwrap(),
            Some(VestingEvent {
                time:   (2 * one_month).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 2 - 1).try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 1000 - tokens_per_period);
        assert_eq!(
            v.get_next_vesting((one_month * 2 - 1).try_into().unwrap(), None)
                .unwrap(),
            Some(VestingEvent {
                time:   (2 * one_month).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 2).try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 973);
        assert_eq!(
            v.get_next_vesting((one_month * 2).try_into().unwrap(), None)
                .unwrap(),
            Some(VestingEvent {
                time:   (3 * one_month).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 72 - 1).try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 14);

        assert_eq!(
            v.get_next_vesting((one_month * 72 - 1).try_into().unwrap(), None)
                .unwrap(),
            Some(VestingEvent {
                time:   (one_month * 72).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 72).try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 0);
        assert_eq!(
            v.get_next_vesting((one_month * 72).try_into().unwrap(), None)
                .unwrap(),
            None
        );

        let value = v
            .get_unvested_balance((one_month * 73).try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 0);
        assert_eq!(
            v.get_next_vesting((one_month * 73).try_into().unwrap(), None)
                .unwrap(),
            None
        );
    }
}
