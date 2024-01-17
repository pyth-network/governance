use anchor_lang::{
    prelude::*,
    solana_program::entrypoint::ProgramResult,
};

declare_id!("tstPARXbQ5yxVkRU2UcZRbYphzbUEW6t5ihzpLaafgz");

#[program]
pub mod wallet_tester {
    use super::*;
    pub fn test_withdraw(_: Context<TestWithdraw>) -> ProgramResult {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TestWithdraw<'info> {
    #[account(mut)]
    payer:          Signer<'info>,
    /// CHECK: this is just a receipt account without any data
    #[account(init_if_needed, payer = payer, space = 0, seeds = [payer.key().as_ref()], bump ) ]
    test_receipt:   AccountInfo<'info>,
    system_program: Program<'info, System>,
}
