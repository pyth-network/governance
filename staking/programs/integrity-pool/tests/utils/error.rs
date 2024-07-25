use {
    litesvm::types::TransactionResult,
    solana_sdk::{
        instruction::InstructionError,
        program_error::ProgramError,
        transaction::TransactionError,
    },
};


pub fn assert_anchor_program_error(
    transaction_result: TransactionResult,
    expected_error: anchor_lang::prelude::Error,
    instruction_index: u8,
) {
    assert_eq!(
        transaction_result.unwrap_err().err,
        TransactionError::InstructionError(
            instruction_index,
            InstructionError::from(u64::from(ProgramError::from(expected_error,)))
        )
    );
}
