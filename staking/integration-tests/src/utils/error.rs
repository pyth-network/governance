#[macro_export]
macro_rules! assert_anchor_program_error {
    ($transaction_result:expr, $expected_error:expr, $instruction_index:expr) => {
        assert_eq!(
            $transaction_result.unwrap_err().err,
            solana_sdk::transaction::TransactionError::InstructionError(
                $instruction_index,
                solana_sdk::instruction::InstructionError::from(u64::from(
                    solana_sdk::program_error::ProgramError::from(
                        anchor_lang::prelude::Error::from($expected_error)
                    )
                ))
            )
        );
    };
}
