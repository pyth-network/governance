# Operational PIP: Upgrade Blast Contract (Pythian Council)

## Abstract

Upgrade the current Pyth oracle contract on Blast to be able to collect a share of the gas fees spent when updating a price on-chain.

## Rationale

Collect the revenue generated from usage of the oracle by downstream applications at no extra cost to users (paid out from the centralized sequencer revenue).

## Description

This proposal is to update the Pyth contract on Blast to enable gas fee claims (as part of sequencer revenue sharing). After we upgrade the contract to this version, we call the new added function which enables the gas fee claims (to the contract itself) and later we can add functionality to claim them.

## Implementation Plan

* Discuss [Proposal](http://xc-admin.xyz.pyth.network/?tab=proposals&proposal=9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su): `9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su` among the Pyth community

* Implement the proposed [Code change](https://github.com/pyth-network/pyth-crosschain/compare/chore/evm/blast-claim-gas) in accordance with the Blast [docs](https://docs.blast.io/building/guides/gas-fees

[Branch](https://github.com/pyth-network/pyth-crosschain/tree/chore/evm/blast-claim-gas): `chore/evm/blast-claim-gas`

* Verify the implementation following the guide below:

1. Make sure you node-js and forge installed.
2. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm)
3. forge: install it from [here](https://getfoundry.sh/)
4. Clone pyth-crosschain repo and run the following command: `npm ci && npx lerna run build`
5. Go to the proposal code branch
6. Get the on-chain implementation code digest by going to the `contract_manager` directory and running this command: `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal <proposal id>`
7. Get the source code digest by going to the `target_chains/ethereum/contracts` and running `npx truffle compile --all && cat build/contracts/PythUpgradable.json | jq -r .deployedBytecode | tr -d '\n' | cast keccak`
8. Match the of the on-chain digest with the source code digest.

p.s: the codes above are not merged in our contract because these are one-off and cannot be in our generic smart-contract. We will store the diff in the repo like [this](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/contracts/canto-deployment-patch.diff) one.
