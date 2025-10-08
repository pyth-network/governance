# Operational PIP 10: Upgrade Entropy contracts on all the mainnet chains (Pythian Council)

## Abstract

Upgrade the Entropy contracts to fix a bug in the callback gas handling logic. This fix ensures that callbacks are only marked as failed when sufficient gas was provided, regardless of the revert code returned.

## Rationale

The previous implementation would mark callbacks as failed based on the return value (`ret.length > 0`) or gas consumption. However, some user contracts catch out-of-gas errors and revert with a different error message, which could lead to incorrect failure marking.

## Description

The bug fix modifies the Entropy contract's callback handling logic to remove the dependency on the revert return data (`ret.length`). Instead, it relies solely on whether sufficient gas was provided to the callback execution. 

**Key changes:**
- Removed the `ret.length > 0` condition from the callback failure check
- Now only checks if `(startingGas * 31) / 32 > uint256(req.gasLimit10k) * TEN_THOUSAND` to determine if enough gas was provided
- This ensures consistent behavior regardless of how user contracts handle out-of-gas conditions

This change prevents false positives where callbacks might be incorrectly marked as failed when user contracts catch and re-throw errors with different messages.

## Implementation Plan

* Discuss [Proposal](https://proposals.pyth.network/?tab=proposals&proposal=6wkDQxQDgaEoDD3XJAyvZmRkPaKfU9jueembJ8XghCZ): `6wkDQxQDgaEoDD3XJAyvZmRkPaKfU9jueembJ8XghCZ` with Pyth community.

* Relevant commits:
    * https://github.com/pyth-network/pyth-crosschain/commit/11198b4

* Pull Request:
    * https://github.com/pyth-network/pyth-crosschain/pull/3106

* Proposal Id:
    * [`6wkDQxQDgaEoDD3XJAyvZmRkPaKfU9jueembJ8XghCZ`](https://proposals.pyth.network/?tab=proposals&proposal=6wkDQxQDgaEoDD3XJAyvZmRkPaKfU9jueembJ8XghCZ)

* Verify the implementation following the guide below:

1. Make sure you have node-js, forge and jq installed.
    1. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm). Install node-js 18 (`nvm install 18; nvm use 18`).
    2. forge: install it from [here](https://getfoundry.sh/)
    3. jq: install it from [here](https://jqlang.github.io/jq/)
2. Clone the `pyth-crosschain` repo (`git clone https://github.com/pyth-network/pyth-crosschain.git`). Go to the `pyth-crosschain` directory and run the following command: `npm ci && npx lerna run build`
3. Get the on-chain implementation code digest by going to the `contract_manager` directory and running `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal 6wkDQxQDgaEoDD3XJAyvZmRkPaKfU9jueembJ8XghCZ`
4. Get the source code digest by going to the `target_chains/ethereum/contracts` directory and running `npx truffle compile --all && cat build/contracts/EntropyUpgradable.json | jq -r .deployedBytecode | tr -d '\r\n' | cast keccak`
5. Check the hash digest from the on-chain implementation (from step 3) matches the hash digest from the source code (from step 4).
