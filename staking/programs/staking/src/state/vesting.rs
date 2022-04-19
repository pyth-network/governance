use anchor_lang::prelude::borsh::BorshSchema;
use std::convert::TryInto;

use anchor_lang::prelude::*;

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
    /// Continuous vesting of (initial_balance/vesting_duration) per time unit
    LinearVesting {
        initial_balance:  u64,
        vesting_duration: u64, // Must be > 0!
        start_date:       i64,
    },
    /// Full balance vests at the cliff date
    CliffVesting {
        initial_balance: u64,
        cliff_date:      i64,
    },
    /// Every (period_duration), (initial_balance/num_periods) vests
    PeriodicVesting {
        initial_balance: u64,
        start_date:      i64,
        period_duration: u64,
        num_periods:     u64,
    },
}

impl Default for VestingSchedule {
    fn default() -> Self {
        VestingSchedule::FullyVested
    }
}

/// Computes  Ceiling(numerator / denominator), i.e. division rounding up. Requires that denominator
/// > 0. Returns the quotient as a u64. For some numerator and denominator choices,
/// the quotient might not fit in a u64, but we aren't interested in those cases.
fn div_round_up(numerator: u128, denominator: u64) -> u64 {
    // Common C-esque trick: (n + d-1)/d computes ceil(n/d)
    ((numerator + ((denominator - 1) as u128)) / (denominator as u128))
        .try_into()
        .unwrap()
}

impl VestingSchedule {
    /// For a vesting schedule and the current time (in the same units used in the vesting
    /// schedule), gets the _unvested_ amount. If the unvested balance is fractional, it rounds
    /// the unvested amount up. It tries to be careful about overflow.
    pub fn get_unvested_balance(&self, current_time: i64) -> Result<u64> {
        match *self {
            VestingSchedule::FullyVested => Ok(0),
            VestingSchedule::LinearVesting {
                initial_balance,
                vesting_duration,
                start_date,
            } => Ok(VestingSchedule::periodic_vesting_helper(
                current_time,
                initial_balance,
                start_date,
                1,
                vesting_duration,
            )),
            VestingSchedule::CliffVesting {
                initial_balance,
                cliff_date,
            } => {
                if current_time < cliff_date {
                    Ok(initial_balance)
                } else {
                    Ok(0)
                }
            }
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
                // we round the unvested balance up
                let periods_remaining = num_periods.checked_sub(periods_passed).unwrap();
                div_round_up(
                    (periods_remaining as u128) * (initial_balance as u128),
                    num_periods,
                )
            }
        }
    }
}

#[cfg(test)]
pub mod tests {
    use crate::state::vesting::{
        div_round_up,
        VestingSchedule,
    };
    use std::convert::TryInto;

    #[test]
    fn test_rounding() {
        assert_eq!(div_round_up(8, 2), 4);
        assert_eq!(div_round_up(9, 2), 5);
        assert_eq!(
            div_round_up(u128::MAX / 4, u64::MAX / 2 - 500),
            u64::MAX / 2 + 503 /* I checked this with WolframAlpha using arbitrary precision
                                * arithmetic */
        );
    }
    #[test]
    fn test_novesting() {
        let v = VestingSchedule::FullyVested;
        assert_eq!(v.get_unvested_balance(0).unwrap(), 0);
        assert_eq!(v.get_unvested_balance(10).unwrap(), 0);
    }
    #[test]
    fn test_linear() {
        let v = VestingSchedule::LinearVesting {
            initial_balance:  20,
            vesting_duration: 6, // Intentionally not divisible
            start_date:       5,
        };
        for t in 0..14 {
            if t <= 5 {
                assert_eq!(v.get_unvested_balance(t).unwrap(), 20);
            } else {
                // Linearly interpolate between (5, 20) and (11, 0)
                let locked_float = f64::max(20.0 + (t - 5) as f64 * -20.0 / 6.0, 0.0);
                assert_eq!(
                    v.get_unvested_balance(t).unwrap(),
                    locked_float.ceil() as u64
                );
            }
        }
    }
    #[test]
    fn test_cliff() {
        let v = VestingSchedule::CliffVesting {
            initial_balance: 20,
            cliff_date:      5,
        };
        assert_eq!(v.get_unvested_balance(0).unwrap(), 20);
        assert_eq!(v.get_unvested_balance(4).unwrap(), 20);
        // This one could go either way, but say (t>=cliff_date) has vested
        assert_eq!(v.get_unvested_balance(5).unwrap(), 0);
        assert_eq!(v.get_unvested_balance(100).unwrap(), 0);
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
        assert_eq!(v.get_unvested_balance(5).unwrap(), 20);
        assert_eq!(v.get_unvested_balance(5 + 7 * 3).unwrap(), 0);
        assert_eq!(v.get_unvested_balance(100).unwrap(), 0);
        let mut t = 5;
        for period in 0..8 {
            let locked_for_period = v.get_unvested_balance(t).unwrap();
            // Linearly interpolate from (0, 20) to (7, 0)
            let locked_float = f64::max(20.0 * (1.0 - period as f64 / 7.0), 0.0);
            assert_eq!(locked_for_period, locked_float.ceil() as u64);
            for _t_in_period in 0..3 {
                assert_eq!(v.get_unvested_balance(t).unwrap(), locked_for_period);
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
    }

    #[test]
    fn default_pyth_vesting() {
        let ONE_MONTH = 61 * 3600 * 12;
        let v = VestingSchedule::PeriodicVesting {
            initial_balance: 1_000,
            start_date:      0,
            period_duration: ONE_MONTH,
            num_periods:     72,
        };

        let TOKENS_PER_PERIOD = 1_000 / 72;

        let value = v.get_unvested_balance(1).unwrap();
        assert_eq!(value, 1000);

        let value = v
            .get_unvested_balance((ONE_MONTH - 1).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 1000);

        let value = v
            .get_unvested_balance(ONE_MONTH.try_into().unwrap())
            .unwrap();
        assert_eq!(value, 1000 - TOKENS_PER_PERIOD);

        let value = v
            .get_unvested_balance((ONE_MONTH * 2 - 1).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 1000 - TOKENS_PER_PERIOD);

        let value = v
            .get_unvested_balance((ONE_MONTH * 2).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 973);

        let value = v
            .get_unvested_balance((ONE_MONTH * 72 - 1).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 14);

        let value = v
            .get_unvested_balance((ONE_MONTH * 72).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 0);

        let value = v
            .get_unvested_balance((ONE_MONTH * 73).try_into().unwrap())
            .unwrap();
        assert_eq!(value, 0);
    }
}
