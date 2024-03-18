# Operational PIP: Accept Pyth Solana receiver governance authority

## Abstract

Accept Pyth Solana receiver governance authority to manage the contract.

## Rationale

The Pythian council need to accept the governance authority from the current owner of the Pyth Solana receiver contract to manage the contract.
This is a requirement for official announcement of the contract.

## Description

Pyth Solana receiver contract has been deployed and tested at the
[`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`](https://solscan.io/account/rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ) address.

The upgrade authority of the contract has been already transferred to the Pythian council and a request has been made to transfer
the governance authority to the Pythian council.

## Implementation Plan

* Proposal id: [`5VH55mD4NhsYpetUiVo89kHjVopgxnuF5ZHXkcatC9EE`](https://proposals.pyth.network/?tab=proposals&proposal=5VH55mD4NhsYpetUiVo89kHjVopgxnuF5ZHXkcatC9EE)

* Verify the implementation following the guide below:

1. Check the `targetGovernanceAuthority` of the contract from Config Account of the receiver contract by going to the "Accounts Data" tab
   [here](https://solscan.io/account/rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ#accountsData)
2. Make sure that this matches the "payer" field of the proposal instruction. `6oXTdojyfDS8m5VtTaYB9xRCxpKGSvKJFndLUPV3V3wT` is the authority of
   the Pythian council multisig and signs the instruction to accept the governance authority.
