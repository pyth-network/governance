# Operational PIP 9: Add Asymmetric Research as a Pythnet validator

## Abstract

This proposal seeks the delegation of a Pythnet stake account to Asymmetric Research to enable their participation as a
Pythnet validator.

## Rationale

Validator diversity is crucial for network resilience and security. Asymmetric Research, having substantial experience
in blockchain validation and security, aims to enhance the robustness and reliability of Pythnet by joining as a
validator. Their history as a Pyth security core contributor further aligns with the network's goals for enhanced
security and trusted validation processes.

## Description

Pythnet, Pyth's appchain, is governed by the Pythian Council, which manages stake accounts and validator roles.

[Asymmetric Research](https://www.asymmetric.re/), a boutique security venture, is deeply committed to its partnerships
with L1/L2 blockchains and DeFi protocols, striving to ensure their safety. Their significant contributions to securing
Pyth's infrastructure as a Pyth security core contributor are a testament to this commitment. By stepping into the
validator role, Asymmetric Research aims to further extend its dedication to maintaining a secure and resilient network.


## Implementation Plan

* Proposal id: [`DCCzA6f25fR7VGXfW9LL6WjyAYQMg42B8EiZmueRvDF2`](https://proposals.pyth.network/?tab=proposals&proposal=DCCzA6f25fR7VGXfW9LL6WjyAYQMg42B8EiZmueRvDF2)

### Verification

Verify the implementation following the guide below:

1. Check that the stake account (`<stakePubkey>`) is an undelegated stake account. You can do this by running
`solana -u https://pythnet.rpcpool.com stakes` in your terminal and looking for `<stakePubkey>`.
2. Check that the associated vote account (`<votePubkey`>) is the key provided by Asymmetric Research as a part of this proposal:
`AR1vDzBzaq1nD19naVMfgTKeM5ifHd7rbxdvyMuG6njg`
