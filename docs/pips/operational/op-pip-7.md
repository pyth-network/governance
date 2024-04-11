# Operational PIP 7: Improve Pyth Solana Receiver compute cost

## Abstract

Upgrade the Pyth Solana Receiver on Solana to reduce compute cost on posting price updates.

## Rationale

Posting price update uses a lot of compute units because it uses an expensive hash function.

## Description

This upgrade will employ Solana SDK's `hashv` function which uses much less compute units.

## Implementation Plan

* The Pyth Solana Receiver contract has been deployed and tested at the
[`rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`](https://solscan.io/account/rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ) address.

* Proposal id: [`BP1hfpWAVZx9Lwgn9B4fokYpbKikqhPWGGmav5SCS89A`](https://proposals.pyth.network/?tab=proposals&proposal=BP1hfpWAVZx9Lwgn9B4fokYpbKikqhPWGGmav5SCS89A)

* Relevant commits:
- https://github.com/pyth-network/pyth-crosschain/commit/0e6484daca38ed5eb5470a9816a81a2b48244ab8


* Verify the implementation following the guide below:

1. Make sure you have the Solana CLI tools, Docker and sha256sum.
    1. solana: install `solana` from [here](https://docs.solanalabs.com/cli/install).
    2. Docker: install it from [here](https://www.docker.com/products/docker-desktop/)
    3. sha256sum: if on Mac you can install it as a part of coreutils with `brew install coreutils`
2. Clone the `pyth-crosschain` repo (`git clone https://github.com/pyth-network/pyth-crosschain.git` (or if you have already cloned it pull the latest changes with `git pull`).
3. Go to `pyth-crosschain/target_chains/solana/`
4. Run `./scripts/build_verifiable_program.sh`. This will compile the code in a reproducible way and output a hash of the bytecode obtained from the code.
5. In the [proposal page](https://proposals.pyth.network/?tab=proposals&proposal=BP1hfpWAVZx9Lwgn9B4fokYpbKikqhPWGGmav5SCS89A), look at the following two important keys:
   1. The `program` field should match the program we're trying to upgrade.
   2. The `buffer` field is the account that contains the proposed new implementation for the program. Copy the address.
6. Get the hash of the proposed buffer `solana -u m program dump <buffer> temp_file && sha256sum temp_file && rm temp_file`
7. Make sure the hash from step 4 and from step 6 match.
