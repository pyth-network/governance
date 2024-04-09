# Operational PIP: Upgrade Entropy contracts on all the chains (Pythian Council)

## Abstract

Upgrade the Entropy contracts to allow users to register a callback when requesting random numbers. This callback is invoked once the request is fulfilled.

## Rationale

The upgrade enhances the developer experience by reducing the interaction to a single transaction.

## Description

The new feature implemented in the Entropy contracts enables users to register a callback when they request for a random number. This callback is automatically called by the Entropy contracts once the request is fulfilled, streamlining the process and improving the developer experience by necessitating only a single transaction.

## Implementation Plan
<!-- TODO: update propsoal link -->
* Discuss [Proposal](https://proposals.pyth.network/?tab=proposals&proposal=9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su): `9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su` among the Pyth community

<!-- TODO: update these commits -->
* Relevant commits:
https://github.com/pyth-network/pyth-crosschain/commit/f79f205895de61ddec69ae3ed6d4bd1ca1c6542f
https://github.com/pyth-network/pyth-crosschain/commit/1e5df8537adbecf300fa51a8b9330db754950a05

<!-- TODO: check if this is correct -->
Proposal id: [`9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su`](https://proposals.pyth.network/?tab=proposals&proposal=9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su)

* Verify the implementation following the guide below:

1. Make sure you have node-js, forge and jq installed.
    1. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm). Install node-js 18 (`nvm install 18; nvm use 18`).
    2. forge: install it from [here](https://getfoundry.sh/)
    3. jq: install it from [here](https://jqlang.github.io/jq/)
2. Clone the `pyth-crosschain` repo (`git clone https://github.com/pyth-network/pyth-crosschain.git`). Go to the `pyth-crosschain` directory and run the following command: `npm ci && npx lerna run build`
3. Get the on-chain implementation code digest by going to the `contract_manager` directory and running `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal <proposal id>`
4. Get the source code digest by going to the `target_chains/ethereum/contracts` directory and running `npx truffle compile --all && cat build/contracts/EntropyUpgradable.json | jq -r .deployedBytecode | tr -d '\r\n' | cast keccak`
5. Check the hash digest from the on-chain implementation (from step 3) matches the hash digest from the source code (from step 4).
