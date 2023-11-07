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
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy, BorshSchema, PartialEq)]
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
                // but again, we need to do the math in 128 bit precision.

                // Since we're in this branch, 0 <= periods_passed <= num_periods, so
                // 0 <= remaining_periods <= num_periods.
                // Additionally 0 <= initial_balance <= u64::MAX, so
                // 0 <= unvested <= initial_balance <= u64::MAX
                // therefore the unwrap can't fail.
                // We round the unvested amount down, this makes the arithmetic for splitting accounts simpler.
                let remaining_periods = num_periods.saturating_sub(periods_passed);

                (((remaining_periods as u128) * (initial_balance as u128)) / (num_periods as u128))
                    .try_into()
                    .unwrap()
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

        let current_unvested: u64 = Self::periodic_vesting_helper(
            current_time,
            initial_balance,
            start_date,
            period_duration,
            num_periods,
        );
        let next_period_unvested = Self::periodic_vesting_helper(
            start_of_next_period,
            initial_balance,
            start_date,
            period_duration,
            num_periods,
        );

        let amount: u64 = current_unvested.saturating_sub(next_period_unvested);

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
        // Note that the arithmetic below may lose precision. The calculations round down
        // the number of vesting tokens for both of the new accounts, which means that splitting
        // may vest some dust (1 of the smallest decimal point) of PYTH for both the source and
        // destination accounts.
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
            VestingSchedule::{
                self,
                PeriodicVesting,
                PeriodicVestingAfterListing,
            },
        },
        quickcheck::TestResult,
        quickcheck_macros::quickcheck,
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
                        amount: 4,
                    })
                );
            } else if t <= 10 {
                // Linearly interpolate between (5, 20) and (11, 0)
                let locked_float = 20.0 + (t - 5) as f64 * -20.0 / 6.0;
                assert_eq!(
                    v.get_unvested_balance(t, None).unwrap(),
                    locked_float.floor() as u64
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
                amount: 3,
            })
        );
        assert_eq!(v.get_unvested_balance(5, None).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(5, None).unwrap(),
            Some(VestingEvent {
                time:   8,
                amount: 3,
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
            assert_eq!(locked_for_period, locked_float.floor() as u64);
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
        assert_eq!(v.get_unvested_balance(5 + 7 * 3, Some(6)).unwrap(), 2);
        assert_eq!(
            v.get_next_vesting(4 + 7 * 3, Some(5)).unwrap(),
            Some(VestingEvent {
                time:   26,
                amount: 2,
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
            assert_eq!(locked_for_period, locked_float.floor() as u64);
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
                amount: 1,
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

        let value = v.get_unvested_balance(1, None).unwrap();
        assert_eq!(value, 1000);
        assert_eq!(
            v.get_next_vesting(1, None).unwrap(),
            Some(VestingEvent {
                time:   one_month.try_into().unwrap(),
                amount: 14,
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
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance(one_month.try_into().unwrap(), None)
            .unwrap();
        assert_eq!(value, 986);
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
        assert_eq!(value, 986);
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
        assert_eq!(value, 972);
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
        assert_eq!(value, 13);

        assert_eq!(
            v.get_next_vesting((one_month * 72 - 1).try_into().unwrap(), None)
                .unwrap(),
            Some(VestingEvent {
                time:   (one_month * 72).try_into().unwrap(),
                amount: 13,
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

    #[quickcheck]
    fn test_split_with_args(transferred: u64, total: u64, initial_balance: u64) -> TestResult {
        if transferred > total || total == 0 {
            return TestResult::discard();
        }

        let schedule = VestingSchedule::FullyVested;
        let (remaining_schedule, transferred_schedule) = schedule
            .split_vesting_schedule(total - transferred, transferred, total)
            .unwrap();

        assert_eq!(remaining_schedule, VestingSchedule::FullyVested);
        assert_eq!(transferred_schedule, VestingSchedule::FullyVested);

        let schedule = PeriodicVesting {
            initial_balance,
            // all of these fields should be preserved in the result
            start_date: 203,
            period_duration: 100,
            num_periods: 12,
        };
        let (remaining_schedule, transferred_schedule) = schedule
            .split_vesting_schedule(total - transferred, transferred, total)
            .unwrap();

        match (remaining_schedule, transferred_schedule) {
            (
                PeriodicVesting {
                    initial_balance: r, ..
                },
                PeriodicVesting {
                    initial_balance: t, ..
                },
            ) => {
                let sum = r + t;
                assert!(initial_balance.saturating_sub(2) <= sum && sum <= initial_balance);
            }
            _ => {
                panic!("Test failed");
            }
        }

        let schedule = PeriodicVestingAfterListing {
            initial_balance,
            // all of these fields should be preserved in the result
            period_duration: 100,
            num_periods: 12,
        };
        let (remaining_schedule, transferred_schedule) = schedule
            .split_vesting_schedule(total - transferred, transferred, total)
            .unwrap();

        match (remaining_schedule, transferred_schedule) {
            (
                PeriodicVestingAfterListing {
                    initial_balance: r, ..
                },
                PeriodicVestingAfterListing {
                    initial_balance: t, ..
                },
            ) => {
                let sum = r + t;
                assert!(initial_balance.saturating_sub(2) <= sum && sum <= initial_balance);
            }
            _ => {
                panic!("Test failed");
            }
        }

        TestResult::passed()
    }

    fn test_split_helper(
        transferred: u64,
        total: u64,
        initial_balance: u64,
        expected_remaining: u64,
        expected_transferred: u64,
    ) {
        let schedule = PeriodicVesting {
            initial_balance,
            // all of these fields should be preserved in the result
            start_date: 203,
            period_duration: 100,
            num_periods: 12,
        };
        let (remaining_schedule, transferred_schedule) = schedule
            .split_vesting_schedule(total - transferred, transferred, total)
            .unwrap();

        let t = PeriodicVesting {
            initial_balance: expected_transferred,
            start_date:      203,
            period_duration: 100,
            num_periods:     12,
        };
        let r = PeriodicVesting {
            initial_balance: expected_remaining,
            start_date:      203,
            period_duration: 100,
            num_periods:     12,
        };

        assert_eq!(remaining_schedule, r);
        assert_eq!(transferred_schedule, t);

        let schedule = PeriodicVestingAfterListing {
            initial_balance,
            period_duration: 100,
            num_periods: 12,
        };
        let (remaining_schedule, transferred_schedule) = schedule
            .split_vesting_schedule(total - transferred, transferred, total)
            .unwrap();

        let t = PeriodicVestingAfterListing {
            initial_balance: expected_transferred,
            period_duration: 100,
            num_periods:     12,
        };
        let r = PeriodicVestingAfterListing {
            initial_balance: expected_remaining,
            period_duration: 100,
            num_periods:     12,
        };

        assert_eq!(remaining_schedule, r);
        assert_eq!(transferred_schedule, t);
    }

    #[test]
    fn test_split() {
        test_split_helper(10, 100, 100, 90, 10);
        test_split_helper(10, 1000, 100, 99, 1);
        test_split_helper(1, 1000, 100, 99, 0);

        test_split_helper(10, 10, 1000, 0, 1000);
        test_split_helper(9, 10, 1000, 100, 900);
        test_split_helper(10, 100, 1000, 900, 100);

        test_split_helper(1, 3, 1000, 666, 333);
    }
}
