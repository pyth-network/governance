use crate::constants::UNBONDING_DURATION;
use anchor_lang::prelude::*;

pub const CUSTODY_SEED: &[u8] = b"custody";
pub const AUTHORITY_SEED: &[u8] = b"authority";

#[account]
#[derive(Default)]
pub struct StakeAccountData {
    pub owner: Pubkey,
    pub lock: VestingState,
    pub positions: Vec<StakeAccountPosition>,
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub enum VestingState {
    VESTED,
    VESTING {
        initial_balance: u64,
        cliff_date: u64,
        vesting_duration: u64,
    },
}

impl Default for VestingState {
    fn default() -> Self {
        VestingState::VESTED
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub struct StakeAccountPosition {
    pub position_transition: PositionTransition,
    pub product: Pubkey,
    pub publisher: Pubkey,
    pub amount: u64,
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub enum PositionTransition {
    UnbondedToBonded {
        activation_epoch: u64,
    },
    BondedToUnbonded {
        activation_epoch: u64,
        unbonding_start: u64,
    }
}

impl StakeAccountPosition {
    pub fn get_current_position(&self, current_epoch: u64) -> Result<PositionState, ProgramError> {
        match self.position_transition {
            PositionTransition::UnbondedToBonded { activation_epoch } => {
                if current_epoch < activation_epoch {
                    Ok(PositionState::BONDING)
                } else {
                    Ok(PositionState::BONDED)
                }
            }
            PositionTransition::BondedToUnbonded {
                activation_epoch,
                unbonding_start,
            } => {
                if current_epoch < activation_epoch {
                    Ok(PositionState::BONDING)
                } else if (activation_epoch <= current_epoch) && (current_epoch < unbonding_start) {
                    Ok(PositionState::BONDED)
                } else if (unbonding_start <= current_epoch)
                    && (current_epoch < unbonding_start + UNBONDING_DURATION)
                {
                    Ok(PositionState::UNBONDING)
                } else {
                    Ok(PositionState::UNBONDED)
                }
            }
        }
    }
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, Copy)]
pub enum PositionState {
    UNBONDED,
    BONDING,
    BONDED,
    UNBONDING,
}

impl StakeAccountData {
    pub fn get_vested_balance(
        &self,
        current_time: u64,
        account_balance: u64,
    ) -> Result<u64, ProgramError> {
        match self.lock {
            VestingState::VESTED => Ok(account_balance),
            VestingState::VESTING {
                initial_balance,
                cliff_date,
                vesting_duration,
            } => {
                if current_time < cliff_date {
                    Ok(account_balance
                        .checked_sub(account_balance - initial_balance)
                        .unwrap())
                } else {
                    let time_passed = current_time.checked_sub(cliff_date).unwrap();
                    let completion = (time_passed as f64 / vesting_duration as f64).min(1f64);

                    let locked_amount = (initial_balance as f64 * (1f64 - completion)) as u64;
                    Ok(account_balance.checked_sub(locked_amount).unwrap())
                }
            }
        }
    }
}
