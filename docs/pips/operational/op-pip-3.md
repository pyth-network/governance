# Operational PIP: Deactivate stake accounts (Pythian Council)

## Abstract

Deactivate stake accounts associated with inactive validators on Pythnet.

## Rationale

Inactive validators interfere with block production.

## Description

Two Pythnet validators have been offline for multiple epochs. The operators of these two validators are unable to bring them back up. In order to reduce the Pythnet deliquent stake, we will deactivate the stake delegated to their vote accounts.

Validators:
- Identity: `HoxprZizumTpg4LEXQiHu5s7y7Twcqvsh6QjukobSqV9`
  - Vote account: `5rvjiFE2hXYDXABREEk4L8nhQGHjU7QreVsd45jpsVJE`
  - Stake account: `GaWbR88EMcU1vRyxkQmaPnEm6aJ8V3W1nEVUT1jqqWvs`
- Identity: `2fCDTVa93dLzoRKPdKNn95okqwc5h6baqZ7GCv4neDnA`
  - Vote account: `FLVYvcVxuzMcZpnXchLz4RMBEGkFPysHFnw6Uy7CYLkw`
  - Stake account: `WWd3NK3PmMkQAx9sEGRDQvxTwtAJ8JdukeheCSoLr3A`

## Implementation Plan

Approve the following proposal:

- [`XXXYYYZZZ`](https://proposals.pyth.network/?tab=proposals&proposal=XXXYYYZZZ)

The following commands will show the delinquent validators and the stake accounts associated with them:

```
$ solana -u https://api2.pythnet.pyth.network validators
$ solana -u https://api2.pythnet.pyth.network stakes
```
