# PIP-2 Rectify the Owner Field for Three Bricked Locked Token Accounts.

- Title
    - Update the Pyth Staking Program (PSP) to rectify the owner field from Token Addresses to vanilla Solana Wallet Addresses (System Program Addresses) for three Token Holders.

- Abstract
    - During the initial distribution of Pyth locked tokens, incorrect addresses (Token Addresses) were used instead of Solana Wallet Addresses for three Token Holders due to a clerical error.
    - This PIP would update the Staking Program to enable replacement of these Token Addresses with the Solana Wallet Addresses which own them. This would recover funds for three locked Pyth Token Holders (PTH) who have been affected by this error. This does not affect unlocked Token Holders or other Locked addresses other than those explicitly listed in this PIP.
    - Both the upgrade of the Staking program and the recovery of the affected Token Addresses are part of this governance vote. Any future use of this new Staking Program functionality will only be possible via governance vote.

- Rationale
    - The PSP requires a PTH supplied Solana Wallet Address so that the PTH can interact with the PSP to stake, vote and withdraw - once tokens have vested according to the schedule in the contract. Transactions signed by the private key of this Solana Wallet Address allow the PTH to operate these functions through the PSP.
    - During the initial allocation and distribution of Locked Pyth tokens in December 2023, a clerical error was made. Three PTH inadvertently supplied a Solana Token Account Address, instead of a Solana Wallet Address. Therefore, the Token Account Addresses were used in place of the Solana Wallet Addresses, placing the funds into an unusable state.
This proposal changes the PSP so that the PTH locked accounts in question can be re-parented by rectifying their owner field from a Token Account Address to the Solana Wallet Address that controls that Token Account.
    - This change allows affected accounts to be re-parented by proposing a governance vote on the recovery of a locked Token Account. This functionality is only exclusively available via the means of a vote to prevent the ability to silently transfer ownership of locked Token Accounts, and hence locked tokens, without approval of the rest of the DAO.
    - This change does not require knowledge of the private key and the only locked Token Accounts able to change are those which are included in this proposal.
    - This PIP transfers ownership of the funds held by the affected Pyth locked Token Holders. It is in the community’s interest to rectify this issue and recover funds accidentally stranded, the cause of which has since been corrected by a variety of off-chain processes and technical measures.

- Key Terms
    - Solana System Program Address/Solana Wallet Address
        - A base Solana account, which is created by the Solana System Program has a public and private key. The address of this account is an encoded form of the public key and is the everyday Solana address type fundamental to the operation of the Blockchain.
    - Token Accounts
        - A Token Account is owned by a Solana Account and holds SPL Tokens for example USDC or PYTH.
        - There are two types; standard Token Accounts (Auxiliary Token Account) which start as Solana Wallet Addresses and are converted to token accounts, Associated Token Accounts (ATAs) which are algorithmically derived from the parent Solana Wallet Address and the token mint address.
        - In both cases the token account is owned by a Solana Wallet Address.
    - Pyth Staking Program
        - The Pyth staking program is the smart contract/Solana program which administers Pyth locked tokens and Pyth tokens staked for the purpose of participating in governance.

- Implementation Plan
    - This change requires the Pyth Locked Token Contract to be changed to include new functionality to rescue these funds and will replace the affected Token Accounts with the Solana Wallet Addresses which own them.
        1. Technical implementation of the recover feature (Github PR: https://github.com/pyth-network/governance/pull/424/files#diff7a3bd7f68f5e45f4fe5033b6b335a5aaea1b6b11664646cbc4899a3246f53fdd) and audit by Asymmetric Research.
        2. On approval by the DAO, an updated smart contract containing this re-parenting functionality will be approved for release.
        3. The same governance vote will also trigger the recovery of the affected accounts.
        4. At this point the affected customers will have their ownership of their Locked Tokens restored and can stake, vote, and withdraw subject to the terms of the smart contract in the same way as locked token holders who were set up correctly.

    - List of locked token accounts which are going to recovered and included in this PIP:
        - 769JyJeAseXsqZM7PZtfdDT6owu9gHw5MTNtYmhb8Age
        - 3s2V3jw7vFqZTE5wG8v42RmUCys6zJTAuXbFpaVFHLAw
        - 4VhA5bHjMpWFpfVSMEwg4URUkKJoy91XPHHrkufBWzwe
