# Operational PIP 3: Deactivate stake accounts (Pythian Council)

## Abstract

Deactivate stake accounts associated with inactive validators on Pythnet.

## Rationale

Inactive validators interfere with block production.

## Description

Two Pythnet validators have been offline for multiple epochs. The operators of these two validators are unable to bring them back up. In order to reduce the Pythnet deliquent stake, we will deactivate the stake delegated to their vote accounts.

Validators:
- Identity: `2fCDTVa93dLzoRKPdKNn95okqwc5h6baqZ7GCv4neDnA`
  - Vote account: `5rvjiFE2hXYDXABREEk4L8nhQGHjU7QreVsd45jpsVJE`
  - Stake account: `GaWbR88EMcU1vRyxkQmaPnEm6aJ8V3W1nEVUT1jqqWvs`
- Identity: `HoxprZizumTpg4LEXQiHu5s7y7Twcqvsh6QjukobSqV9`
  - Vote account: `FLVYvcVxuzMcZpnXchLz4RMBEGkFPysHFnw6Uy7CYLkw`
  - Stake account: `WWd3NK3PmMkQAx9sEGRDQvxTwtAJ8JdukeheCSoLr3A`

## Implementation Plan

* Proposal id: [`DGPSH5fBSSHegaESeUP8L8KxY1R2CN3fZDQMchaqhAUp`](https://proposals.pyth.network/?tab=proposals&proposal=DGPSH5fBSSHegaESeUP8L8KxY1R2CN3fZDQMchaqhAUp)


* Verify the implementation following the guide below:

1. Make sure you have the Solana CLI. You can install it [here](https://docs.solanalabs.com/cli/install)
2. Find out the `Vote Account` keys of the two deliquent validators by running `solana -u https://pythnet.rpcpool.com validators` in your terminal. The deliquent validators are indicated with a warning sign.
3. Find out their `Stake Pubkey`s  by running `solana -u https://pythnet.rpcpool.com stakes <vote account>`
4. Check that the `Stake Pubkey`s from step 3 match the `stakePubkey`s in [the proposal UI](https://proposals.pyth.network/?tab=proposals&proposal=DGPSH5fBSSHegaESeUP8L8KxY1R2CN3fZDQMchaqhAUp).
