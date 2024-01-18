# [DRAFT] Pyth DAO Constitution Proposal

## Terminology

- **Votable Token:** staked token in the governance contract
- **Pyth Improvement Proposal (PIP)**
- **Pyth DAO Treasury:** all tokens held in the governance smart contract that is directly governed by the Pyth DAO via on-chain voting
- **Pyth Forum:** the system adopted by the DAO to manage PIP, organize the voting process and provide connectivity to the governance contract on the Solana Blockchain
- **Pythian Multisig Wallet:** smart contract wallet signed by the elected members of the Pythian Council
- **Price Feed Multisig Wallet:** smart contract wallet signed by the elected members of the Price Feed Council
- **Operations Wallet:** smart contract wallet used by council members to submit PIPs on-chain. Each council has access to a dedicated and separate Operations Wallet.
- **PGAS:** utility token exclusively used in the Pythnet Appchain, governed by the Pyth DAO
- **Pythnet Appchain:** blockchain instance dedicated to the production of the pyth data, governed by the Pyth DAO
- **Pyth DAO LLC Agreement:** ipfs://QmP2GmL1n2WbHd7AtHqyXVWFyyHH36aZLfVZbNoqhommJi

## Introduction

This Constitution describes the decision-making framework for the Pyth DAO and the governing framework for the holders of $PYTH.

Rules and procedures in this Constitution will be generally enforced through on-chain contracts and the associated parameters, unless specified by the Pyth DAO for actuation off-chain.

The Pyth DAO is legally structured as “Pyth DAO LLC” (of which the OPERATING AGREEMENT OF PYTH DAO LLC is available at: [ipfs://QmP2GmL1n2WbHd7AtHqyXVWFyyHH36aZLfVZbNoqhommJi](https://cloudflare-ipfs.com/ipfs/QmP2GmL1n2WbHd7AtHqyXVWFyyHH36aZLfVZbNoqhommJi)). The wrapper enables the DAO to hold the treasury, protect DAO members from unlimited liability, and allow DAO members to take part in governance.

![pyth_dao.light.png](diagrams/pyth_dao.light.png)

## Pyth DAO Governance Procedures

### Pyth Improvement Proposals

Pyth Improvement Proposals (”PIPs”) are the primary methods to introduce, discuss and implement changes to the Pyth DAO constitution, governance and operations.

### PIP Types

Each PIP must be labeled as:

- Constitutional PIPs are voted on by the Pyth DAO and they involve:
  - the upgrade of the Governance, Staking or Multisig programs
  - the amendment of this Constitution
- Operational PIPs that are either voted on by the Pyth DAO or delegated to one of the two Councils.
  - Operational PIPs that are voted on by the Pyth DAO:
        - the election of the Pythian Council
        - the election of the Price Feed Council
        - the management of the Pyth DAO Treasury
        - the exceptional replacement of a council member
  - Operational PIPs delegated to the Pythian Council involve:
        - the upgrade of the oracle program
        - the upgrade of the verification program for each of the blockchains where Pyth data is accessible
        - the setting of data request fees per blockchain
        - the management of PGAS allocation and delegation to validators
  - Operational PIPs delegated to the Price Feed Council involve:
        - the management of the list of price feeds available through Pyth
        - the selection of publishers and the setting of the minimum number of such publishers per price feed

### PIP Process

No PIP may be in violation of any of terms of the Pyth DAO LLC Agreement, or any applicable laws, in particular sanctions-related regulations.

The end to end process length is 7 days.

1. **Proposal Submission**

A PIP is submitted through a structured process via the **Pyth Forum** (e.g. GitHub), marking the initiation of the formal review process. Each PIP needs to include:

- Abstract - that summarizes the PIP
- Rationale - that explains why the Pyth community should implement the PIP and how it aligns with community’s mission and values
- Key Terms - technical and/or commercial associated with the PIP
- Implementation Plan - steps envisioned to implement the PIP, including resources needed for each step and timelines. The implementation plan may include binding on-chain actions that will automatically execute when the PIP passes.

Once the proposed PIP is reviewed, a member of the council responsible for the PIP uses the corresponding Operations Wallet to submit the proposed PIP on-chain.

2. **DAO Voting on formal PIP (7 days)**

The Pyth DAO is able to vote directly on-chain on the submitted PIP during 7 days. The PIP passes if the following condition is met:

- in the case of a Constitutional PIP, > 67% of all Votable Tokens have been cast "in favor"; or
- in the case of a Operational PIP that is voted on by the Pyth DAO, > 50% of all Votable Tokens have been cast "in favor"

3. **Implementation**

The PIP is then fully executed and implemented. Any on-chain actions in the implementation plan will execute automatically in this step.

## Council Election Process

1. **The Pythian Council**

The Pythian Council is made of 9 members who are signers of the Pythian Multisig Wallet, including the Operations Wallet.  The Pythian Multisig Wallet has powers to perform actions that are delegated to it by the Pyth DAO. The execution of such actions by the Pythian Council require 7-of-9 approval. The on-chain submission of a PIP using the Operations Wallet carries one vote in favour of the PIP.

The first election of the Pythian Council will be ratified on-chain. The date chosen for the first election will form the basis for all future elections. Every election should begin 6 months after the previous election has started and it will replace 4 members of its cohort of 8 members.

The 4 members to remain are selected given the following cascading criteria:

- the shorter tenure till the date of the election;
- in the case of equal tenure, the member with the higher amount of votes in the last election;
- in the case of equal tenure and equal amounts of votes, the member with the higher count of multisig participations

unless such member decides to step down from the Pythian Council.

Any Council member who has voted less than 1/3 of the proposals during the term will be excluded from re-election.

The following process governs the election that starts at time T:

- Nomination (T until T+2 days): Any DAO member can nominate himself or herself for candidacy to the Council. Each candidate sponsor, a person nominating a candidate or the candidate himself or herself, must hold at least 50,000 of Votable Tokens
- Member Election (T+2 days until T+7 days): Each token may be cast for one candidate.

In the event of a member needing to be exceptionally replaced outside of scheduled elections, the non-elected candidate with the highest amount of votes from the last election of the Pythian Council will be offered membership in the Pythian Council.

2. **The Price Feed Council**

The Price Feed Council is made of 8 members who are signers of the Price Feed Multisig Wallet, including the Operations Wallet. The Price Feed Multisig Wallet has powers to perform actions that are delegated to it by the Pyth DAO. The execution of such actions by the Price Feed Council require 5-of-8 approval. The on-chain submission of a PIP using the Operations Wallet carries one vote in favour of the PIP.

The first election of the Price Feed Council will be ratified on-chain. The date chosen for the first election will form the basis for all future elections. Every election should begin 6 months after the previous election has started and it will replace 3 members of its cohort of 7 members.

The 3 members to remain are selected given the following cascading criteria:

- the shorter tenure till the date of the election;
- in the case of equal tenure, the member with the higher amount of votes in the last election;
- in the case of equal tenure and equal amounts of votes, the member with the higher count of multisig participations

unless such member decides to step down from the Pythian Council.

Any Council member who has voted less than 1/3 of the proposals during the term will be excluded from re-election.

The following process governs the election that starts at time T:

- Nomination (T until T+2 days): Any DAO member can nominate himself or herself for candidacy to the Council. Each candidate sponsor, a person nominating a candidate or the candidate himself or herself, must hold at least 50,000 of Votable Tokens
- Member Election (T+2 days until T+7 days): Each token may be cast for one candidate.

In the event of a member needing to be exceptionally replaced outside of scheduled elections, the non-elected candidate with the highest amount of votes from the last election of the Price Feed Council will be offered membership in the Price Feed Council.

## Community Values

The Pyth DAO is built on the principles of ownership and governance. Its members work together to achieve common goals, and they share in the success of Pyth. As such, the guiding values of the Pyth DAO should be:

- Sustainability: the Pyth DAO should be long-term hungry;
- Inclusivity: everyone can play a role in the Pyth DAO; and
- Enablement-focused: individuals and teams that innovate, compete and contribute to the growth of Pyth should be empowered and encouraged.
