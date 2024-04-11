# Operational PIP: Upgrade Entropy contracts on all the testnet chains (Pythian Council)

## Abstract

Upgrade the Entropy contracts to allow users to register a callback when requesting random numbers. This callback is invoked once the request is fulfilled.

## Rationale

The upgrade enhances the developer experience by reducing the interaction to a single transaction.

## Description

The new feature implemented in the Entropy contracts enables users to register a callback when they request for a random number. This callback is automatically called by the Entropy contracts once the request is fulfilled, streamlining the process and improving the developer experience by necessitating only a single transaction.

## Implementation Plan
* Discuss [Proposal](https://proposals.pyth.network/?tab=proposals&proposal=7GtMSk193YaxCNjtiub4ksyip9ZwsFu2TD77rk3t7Be5): `7GtMSk193YaxCNjtiub4ksyip9ZwsFu2TD77rk3t7Be5` with Pyth community.

* Relevant commits:
    * https://github.com/pyth-network/pyth-crosschain/commit/e7bf47a18e2d9a9d983214342540691c1bada52e
    * https://github.com/pyth-network/pyth-crosschain/commit/d821e01109df9bad1f17c8e4e7d3d76bd9131747
    * https://github.com/pyth-network/pyth-crosschain/commit/02e196e9242d258d43056f7f2c3762d95bf285d3

* Proposal Ids:
    * [`7GtMSk193YaxCNjtiub4ksyip9ZwsFu2TD77rk3t7Be5`](https://proposals.pyth.network/?tab=proposals&proposal=7GtMSk193YaxCNjtiub4ksyip9ZwsFu2TD77rk3t7Be5)

* Verify the implementation following the guide below:

1. Make sure you have node-js, forge and jq installed.
    1. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm). Install node-js 18 (`nvm install 18; nvm use 18`).
    2. forge: install it from [here](https://getfoundry.sh/)
    3. jq: install it from [here](https://jqlang.github.io/jq/)
2. Clone the `pyth-crosschain` repo (`git clone https://github.com/pyth-network/pyth-crosschain.git`). Go to the `pyth-crosschain` directory and run the following command: `npm ci && npx lerna run build`
3. Get the on-chain implementation code digest by going to the `contract_manager` directory and running `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal <proposal id>`
4. Get the source code digest by going to the `target_chains/ethereum/contracts` directory and running `npx truffle compile --all && cat build/contracts/EntropyUpgradable.json | jq -r .deployedBytecode | tr -d '\r\n' | cast keccak`
5. Check the hash digest from the on-chain implementation (from step 3) matches the hash digest from the source code (from step 4).
