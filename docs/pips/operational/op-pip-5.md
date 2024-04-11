# Operational PIP 5: Improve usability of Pyth Solana Receiver

## Abstract

Upgrade the Pyth Solana Receiver on Solana to support new features.

## Rationale

We want the Pyth Solana Receiver to support these new features to improve its usability. Moreover, these features will enable the option to build a push oracle on top of the Pyth Solana Receiver.

## Description

We are adding two features:
- The option to provide a write authority, different than the payer when posting price updates. The payer is responsible for funding the rent of new price update accounts and to pay the fee for posting an update while the write authority has the ability to update the price update present in an existing price update account.
- When a price update gets posted it will contain a `posted_slot`, this field can be used to check when the update got posted on Solana.

## Implementation Plan

* The Pyth Solana Receiver contract has been deployed and tested at the
[`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`](https://solscan.io/account/rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ) address.

* Proposal id: [`FZJywtTuJqZMRtP72Vh4dvcBhduGHLNz58Y3X3C5EpW6`](https://proposals.pyth.network/?tab=proposals&proposal=FZJywtTuJqZMRtP72Vh4dvcBhduGHLNz58Y3X3C5EpW6)

* Relevant commits:
https://github.com/pyth-network/pyth-crosschain/commit/f79f205895de61ddec69ae3ed6d4bd1ca1c6542f
https://github.com/pyth-network/pyth-crosschain/commit/1e5df8537adbecf300fa51a8b9330db754950a05

* Verify the implementation following the guide below:

1. Make sure you have the Solana CLI tools, Docker and sha256sum.
    1. solana: install `solana` from [here](https://docs.solanalabs.com/cli/install).
    2. Docker: install it from [here](https://www.docker.com/products/docker-desktop/)
    3. sha256sum: if on Mac you can install it as a part of coreutils with `brew install coreutils`
2. Clone the `pyth-crosschain` repo (`git clone https://github.com/pyth-network/pyth-crosschain.git`).
3. Go to `pyth-crosschain/target_chains/solana/`
4. Run `./scripts/build_verifiable_program.sh`. This will compile the code in a reproducible way and output a hash of the bytecode obtained from the code.
5. In the [proposal page](https://proposals.pyth.network/?tab=proposals&proposal=FZJywtTuJqZMRtP72Vh4dvcBhduGHLNz58Y3X3C5EpW6), look at the following two important keys:
   1. The `program` field should match the program we're trying to upgrade.
   2. The `buffer` field is the account that contains the proposed new implementation for the program. Copy the address.
6. Get the hash of the proposed buffer `solana -u m program dump <buffer> temp_file && sha256sum temp_file && rm temp_file`
7. Make sure the hash from step 4 and from step 6 match.
