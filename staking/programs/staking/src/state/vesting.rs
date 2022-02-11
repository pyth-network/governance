use std::convert::TryInto;

use anchor_lang::prelude::*;

use super::stake_account::StakeAccountData;

// Anchor does not allow this...
// type UnixTimestamp = i64;


#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub enum VestingSchedule {
    FullyVested,
    LinearVesting {
        initial_balance: u64,
        vesting_duration: u64, // In seconds, must be > 0!
        start_date: i64
    },
    CliffVesting {
        initial_balance: u64,
        cliff_date: i64,
    },
    PeriodicVesting {
        initial_balance: u64,
        start_date: i64,
        period_duration: u64,
        num_periods: u64
    },
}

impl Default for VestingSchedule {
    fn default() -> Self {
        VestingSchedule::FullyVested
    }
}

fn div_round_up(numerator: u128, denominator: u64) -> u64 {
    ((numerator + ((denominator-1) as u128)) / (denominator as u128)).try_into().unwrap()
}

impl StakeAccountData {
    pub fn get_locked_balance(
        &self,
        current_time: i64
    ) -> Result<u64, ProgramError> {
        match self.lock {
            VestingSchedule::FullyVested => Ok(0),
            VestingSchedule::LinearVesting {
                initial_balance,
                vesting_duration,
                start_date,
            } => {
                    if current_time < start_date {
                        Ok(initial_balance)
                    } else {
                        // From ^ check, we know this subtraction has to be non-negative
                        let time_passed = current_time.checked_sub(start_date).unwrap() as u64;
                        if time_passed > vesting_duration {
                            Ok(0)
                        } else {
                            // Want to calculate: inital_balance * (time_passed / vesting_duration)
                            // At least in theory, initial_balance * time_passed could overflow a u64, but it can't overflow a u128
                            // We want the locked amount to round up
                            Ok(div_round_up((initial_balance as u128) * (time_passed as u128), vesting_duration))
                        }
                    }
            },
            VestingSchedule::CliffVesting {
                initial_balance, cliff_date
            } => { 
                if current_time < cliff_date {
                    Ok(initial_balance)
                } else {
                    Ok(0)
                }
             },
            VestingSchedule::PeriodicVesting {
                initial_balance, start_date, period_duration, num_periods
            } => {
                if current_time < start_date {
                    Ok(initial_balance)
                } else {
                    let time_passed = current_time.checked_sub(start_date).unwrap() as u64;
                    let periods_passed = time_passed / period_duration; // Definitely round this one down
                    if periods_passed >= num_periods {
                        Ok(0)
                    } else {
                        // Amount that vests per period is (initial_balance / num_periods),
                        // but again, we need to do the math in 128 bit precision and make sure
                        // we round the locked balance up
                        let periods_remaining = num_periods - periods_passed;
                        Ok(div_round_up((periods_remaining as u128) * (initial_balance as u128), num_periods))
                    }
                }
            }
        }
    }
}
