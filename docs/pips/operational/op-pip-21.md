# Operational PIP 21: Upgrade Entropy contracts on all the testnet chains (Pythian Council)

## Abstract

Upgrade the Entropy contracts to add additional functionality for reducing gas costs on reveal transactions.

## Rationale

The upgrade aims to reduce the number of hashes required for each reveal by allowing the provider to advance their commitment to a a more recent sequence number that is already used.

## Description

The new feature implemented in the Entropy contracts is accompanied by the changes in Fortuna service that periodically checks the on-chain state and advances the commitment if necessary.

## Implementation Plan
* Discuss [Proposal](https://proposals.pyth.network/?tab=proposals&proposal=qwtDtozGqtq9dkH6CGa8AszgfjL9xgTeffgZ22PUVNw): `qwtDtozGqtq9dkH6CGa8AszgfjL9xgTeffgZ22PUVNw` with Pyth community.

* Relevant commits:
    * https://github.com/pyth-network/pyth-crosschain/commit/89664442760fd358dd2743ecfebcb8d9e9f18182

* Proposal Ids:
    * [`qwtDtozGqtq9dkH6CGa8AszgfjL9xgTeffgZ22PUVNw`](https://proposals.pyth.network/?tab=proposals&proposal=qwtDtozGqtq9dkH6CGa8AszgfjL9xgTeffgZ22PUVNw)

* Verify the implementation following the guide below:

1. Make sure you have node-js, forge and jq installed.
    1. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm). Install node-js 18 (`nvm install 18; nvm use 18`).
    2. forge: install it from [here](https://getfoundry.sh/)
    3. jq: install it from [here](https://jqlang.github.io/jq/)
2. Clone the `pyth-crosschain` repo (`git clone https://github.com/pyth-network/pyth-crosschain.git`). Go to the `pyth-crosschain` directory and run the following command: `npm ci && npx lerna run build`
3. Get the on-chain implementation code digest by going to the `contract_manager` directory and running `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal <proposal id>`
4. Get the source code digest by going to the `target_chains/ethereum/contracts` directory and running `npx truffle compile --all && cat build/contracts/EntropyUpgradable.json | jq -r .deployedBytecode | tr -d '\r\n' | cast keccak`
5. Check the hash digest from the on-chain implementation (from step 3) matches the hash digest from the source code (from step 4).
