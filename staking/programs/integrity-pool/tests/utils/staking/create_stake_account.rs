use {
    super::init_config::get_config_address,
    crate::utils::account::{
        create_account,
        fetch_account_data,
    },
    anchor_lang::{
        InstructionData,
        ToAccountMetas,
    },
    solana_sdk::{
        instruction::Instruction,
        pubkey::Pubkey,
        signature::Keypair,
        signer::Signer,
        system_program,
        transaction::Transaction,
    },
    staking::state::global_config::GlobalConfig,
};

pub fn get_stake_account_metadata_address(stake_account_positions: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            staking::context::STAKE_ACCOUNT_METADATA_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
}

pub fn get_stake_account_custody_address(stake_account_positions: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            staking::context::CUSTODY_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
}

pub fn get_stake_account_custory_authority_address(
    stake_account_positions: Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            staking::context::AUTHORITY_SEED.as_bytes(),
            stake_account_positions.as_ref(),
        ],
        &staking::ID,
    )
}

pub fn create_stake_account(
    svm: &mut litesvm::LiteSVM,
    payer: &Keypair,
    pyth_token_mint: &Keypair,
    join_dao_llc: bool,
    airdrop: bool,
) -> Pubkey {
    let stake_account_positions = create_account(
        svm,
        payer,
        staking::state::positions::PositionData::LEN,
        staking::ID,
    );

    let (stake_account_metadata, _) = get_stake_account_metadata_address(stake_account_positions);
    let (stake_account_custody, _) = get_stake_account_custody_address(stake_account_positions);
    let (custody_authority, _) =
        get_stake_account_custory_authority_address(stake_account_positions);
    let (config_account, _) = get_config_address();

    let create_stake_account_data = staking::instruction::CreateStakeAccount {
        owner: payer.pubkey(),
        lock:  staking::state::vesting::VestingSchedule::FullyVested,
    };
    let create_stake_account_accs = staking::accounts::CreateStakeAccount {
        payer: payer.pubkey(),
        stake_account_positions,
        stake_account_metadata,
        stake_account_custody,
        custody_authority,
        config: config_account,
        pyth_token_mint: pyth_token_mint.pubkey(),
        token_program: spl_token::id(),
        system_program: system_program::ID,
        rent: solana_program::sysvar::rent::ID,
    };
    let create_stake_account_ix = Instruction::new_with_bytes(
        staking::ID,
        &create_stake_account_data.data(),
        create_stake_account_accs.to_account_metas(None),
    );
    let create_stake_account_tx = Transaction::new_signed_with_payer(
        &[create_stake_account_ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    svm.send_transaction(create_stake_account_tx).unwrap();

    if join_dao_llc {
        let (config_account, _) = get_config_address();

        let config = fetch_account_data::<GlobalConfig>(svm, &config_account);

        let join_dao_llc_data = staking::instruction::JoinDaoLlc {
            _agreement_hash: config.agreement_hash,
        };
        let join_dao_llc_accs = staking::accounts::JoinDaoLlc {
            owner: payer.pubkey(),
            stake_account_positions,
            stake_account_metadata,
            config: config_account,
        };
        let join_dao_llc_ix = Instruction::new_with_bytes(
            staking::ID,
            &join_dao_llc_data.data(),
            join_dao_llc_accs.to_account_metas(None),
        );
        let join_dao_llc_tx = Transaction::new_signed_with_payer(
            &[join_dao_llc_ix],
            Some(&payer.pubkey()),
            &[&payer],
            svm.latest_blockhash(),
        );
        svm.send_transaction(join_dao_llc_tx).unwrap();
    }

    if airdrop {
        let mint_to_ix = spl_token::instruction::mint_to(
            &spl_token::id(),
            &pyth_token_mint.pubkey(),
            &stake_account_custody,
            &payer.pubkey(),
            &[&payer.pubkey(), &pyth_token_mint.pubkey()],
            100,
        )
        .unwrap();
        let mint_to_tx = Transaction::new_signed_with_payer(
            &[mint_to_ix],
            Some(&payer.pubkey()),
            &[&payer, &pyth_token_mint],
            svm.latest_blockhash(),
        );
        svm.send_transaction(mint_to_tx).unwrap();
    }

    stake_account_positions
}
