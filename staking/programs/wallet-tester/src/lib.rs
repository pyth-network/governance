use anchor_lang::prelude::*;

declare_id!("tstPARXbQ5yxVkRU2UcZRbYphzbUEW6t5ihzpLaafgz");

#[program]
pub mod wallet_tester {
    use super::*;

    pub fn test(ctx: Context<Test>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Test<'info> {
    #[account(mut)]
    payer:          Signer<'info>,
    /// CHECK: this is just a receipt account without any data
    #[account(init_if_needed, payer = payer, space = 0, seeds = [payer.key().as_ref()], bump ) ]
    test_receipt:   AccountInfo<'info>,
    system_program: Program<'info, System>,
}
