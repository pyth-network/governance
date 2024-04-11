# Operational PIP 4: Accept Pyth Solana receiver governance authority

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

1. Check out the instruction to accept the governance authority from
   [here](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/solana/programs/pyth-solana-receiver/src/lib.rs#L82-L91).
   Also, some constraints are checked in the context definition
   [here](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/solana/programs/pyth-solana-receiver/src/lib.rs#L276-L285).
