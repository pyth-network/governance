#![allow(clippy::unused_unit)]

use crate::error::ErrorCode;
use anchor_lang::prelude::borsh::BorshSchema;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::wasm_bindgen;
use std::convert::TryInto;

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
    pub fn get_unvested_balance(&self, current_time: i64) -> Result<u64> {
        match *self {
            VestingSchedule::FullyVested => Ok(0),
            VestingSchedule::PeriodicVesting {
                initial_balance,
                start_date,
                period_duration,
                num_periods,
            } => Ok(VestingSchedule::periodic_vesting_helper(
                current_time,
                initial_balance,
                start_date,
                period_duration,
                num_periods,
            )),
        }
    }

    pub fn get_next_vesting(&self, current_time: i64) -> Result<Option<VestingEvent>> {
        match *self {
            VestingSchedule::FullyVested => Ok(None),
            VestingSchedule::PeriodicVesting {
                initial_balance,
                start_date,
                period_duration,
                num_periods,
            } => {
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
}

#[cfg(test)]
pub mod tests {
    use crate::state::vesting::{
        VestingEvent,
        VestingSchedule,
    };
    use std::convert::TryInto;

    #[test]
    fn test_novesting() {
        let v = VestingSchedule::FullyVested;
        assert_eq!(v.get_unvested_balance(0).unwrap(), 0);
        assert_eq!(v.get_next_vesting(0).unwrap(), None);
        assert_eq!(v.get_unvested_balance(10).unwrap(), 0);
        assert_eq!(v.get_next_vesting(10).unwrap(), None);
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
                assert_eq!(v.get_unvested_balance(t).unwrap(), 20);
                assert_eq!(
                    v.get_next_vesting(t).unwrap(),
                    Some(VestingEvent {
                        time:   6,
                        amount: 3,
                    })
                );
            } else if t <= 10 {
                // Linearly interpolate between (5, 20) and (11, 0)
                let locked_float = 20.0 + (t - 5) as f64 * -20.0 / 6.0;
                assert_eq!(
                    v.get_unvested_balance(t).unwrap(),
                    locked_float.ceil() as u64
                );
                assert_eq!(
                    v.get_next_vesting(t).unwrap(),
                    Some(VestingEvent {
                        time:   t + 1,
                        amount: v.get_unvested_balance(t).unwrap()
                            - v.get_unvested_balance(t + 1).unwrap(),
                    })
                );
            } else {
                // Linearly interpolate between (5, 20) and (11, 0)
                let locked_float = 0;
                assert_eq!(v.get_unvested_balance(t).unwrap(), locked_float);
                assert_eq!(v.get_next_vesting(t).unwrap(), None);
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
        assert_eq!(v.get_unvested_balance(0).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(0).unwrap(),
            Some(VestingEvent {
                time:   5,
                amount: 20,
            })
        );
        assert_eq!(v.get_unvested_balance(4).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(4).unwrap(),
            Some(VestingEvent {
                time:   5,
                amount: 20,
            })
        );
        // This one could go either way, but say (t>=cliff_date) has vested
        assert_eq!(v.get_unvested_balance(5).unwrap(), 0);
        assert_eq!(v.get_next_vesting(5).unwrap(), None);
        assert_eq!(v.get_unvested_balance(100).unwrap(), 0);
        assert_eq!(v.get_next_vesting(100).unwrap(), None);
    }

    #[test]
    fn test_period() {
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 20,
            start_date:      5,
            period_duration: 3,
            num_periods:     7,
        };
        assert_eq!(v.get_unvested_balance(0).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(0).unwrap(),
            Some(VestingEvent {
                time:   8,
                amount: 2,
            })
        );
        assert_eq!(v.get_unvested_balance(5).unwrap(), 20);
        assert_eq!(
            v.get_next_vesting(5).unwrap(),
            Some(VestingEvent {
                time:   8,
                amount: 2,
            })
        );
        assert_eq!(v.get_unvested_balance(5 + 7 * 3).unwrap(), 0);
        assert_eq!(v.get_next_vesting(5 + 7 * 3).unwrap(), None);
        assert_eq!(v.get_unvested_balance(100).unwrap(), 0);
        assert_eq!(v.get_next_vesting(100).unwrap(), None);
        let mut t = 5;
        for period in 0..8 {
            let locked_for_period = v.get_unvested_balance(t).unwrap();
            // Linearly interpolate from (0, 20) to (7, 0)
            let locked_float = f64::max(20.0 * (1.0 - period as f64 / 7.0), 0.0);
            assert_eq!(locked_for_period, locked_float.ceil() as u64);
            for _t_in_period in 0..3 {
                assert_eq!(v.get_unvested_balance(t).unwrap(), locked_for_period);
                if period < 7 {
                    assert_eq!(
                        v.get_next_vesting(t).unwrap(),
                        Some(VestingEvent {
                            time:   t + 3 - _t_in_period,
                            amount: v.get_unvested_balance(t).unwrap()
                                - v.get_unvested_balance(t + 3).unwrap(),
                        })
                    );
                } else {
                    assert_eq!(v.get_next_vesting(t).unwrap(), None)
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
        v.get_unvested_balance(9223372036854775264).unwrap();
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
        let value = v.get_unvested_balance(1 << 60).unwrap();
        assert!(value <= 1_000_000_000);
        assert_eq!(
            v.get_next_vesting(1 << 60).unwrap(),
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

        let value = v.get_unvested_balance(1).unwrap();
        assert_eq!(value, 1000);
        assert_eq!(
            v.get_next_vesting(1).unwrap(),
            Some(VestingEvent {
                time:   one_month.try_into().unwrap(),
                amount: 13,
            })
        );

        let value = v
            .get_unvested_balance((one_month - 1).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 1000);
        assert_eq!(
            v.get_next_vesting((one_month - 1).try_into().unwrap())
                .unwrap(),
            Some(VestingEvent {
                time:   one_month.try_into().unwrap(),
                amount: 13,
            })
        );

        let value = v
            .get_unvested_balance(one_month.try_into().unwrap())
            .unwrap();
        assert_eq!(value, 1000 - tokens_per_period);
        assert_eq!(
            v.get_next_vesting(one_month.try_into().unwrap()).unwrap(),
            Some(VestingEvent {
                time:   (2 * one_month).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 2 - 1).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 1000 - tokens_per_period);
        assert_eq!(
            v.get_next_vesting((one_month * 2 - 1).try_into().unwrap())
                .unwrap(),
            Some(VestingEvent {
                time:   (2 * one_month).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 2).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 973);
        assert_eq!(
            v.get_next_vesting((one_month * 2).try_into().unwrap())
                .unwrap(),
            Some(VestingEvent {
                time:   (3 * one_month).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 72 - 1).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 14);

        assert_eq!(
            v.get_next_vesting((one_month * 72 - 1).try_into().unwrap())
                .unwrap(),
            Some(VestingEvent {
                time:   (one_month * 72).try_into().unwrap(),
                amount: 14,
            })
        );

        let value = v
            .get_unvested_balance((one_month * 72).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 0);
        assert_eq!(
            v.get_next_vesting((one_month * 72).try_into().unwrap())
                .unwrap(),
            None
        );

        let value = v
            .get_unvested_balance((one_month * 73).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 0);
        assert_eq!(
            v.get_next_vesting((one_month * 73).try_into().unwrap())
                .unwrap(),
            None
        );
    }
}
