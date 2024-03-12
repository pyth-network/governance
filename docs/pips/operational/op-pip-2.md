# Operational PIP: Upgrade Mode Contract (Pythian Council)

## Abstract

Upgrade the current Pyth oracle contract on Mode to be able to collect a share of the gas fees spent when updating a price on-chain.

## Rationale

Collect the revenue generated from usage of the oracle by downstream applications at no extra cost to users (paid out from the centralized sequencer revenue).

## Description

This proposal is to update the Pyth contract on Mode to enable gas fee claims (as part of sequencer revenue sharing of these protocols). After we upgrade the contract to this version, we call the new added function which enables the gas fee claims (to the contract itself) and later we can add functionality to claim them.

## Implementation Plan

* Discuss [Proposal](https://xc-admin.xyz.pyth.network/?tab=proposals&proposal=3GPW7Xed6N8Tfix21VqmywHJg5JDeK3nMJMD1gwmQvth): `3GPW7Xed6N8Tfix21VqmywHJg5JDeK3nMJMD1gwmQvth` among the Pyth community

* Implement the proposed [Code change](https://github.com/pyth-network/pyth-crosschain/compare/chore/evm/mode-claim-gas) ([docs](https://docs.mode.network/build-on-mode/sfs-sequencer-fee-sharing/register-a-smart-contract/sfs-registering-a-contract-with-remix) for this change and gas sharing contract address)

Proposal id: [`3GPW7Xed6N8Tfix21VqmywHJg5JDeK3nMJMD1gwmQvth`](https://proposals.pyth.network/?tab=proposals&proposal=3GPW7Xed6N8Tfix21VqmywHJg5JDeK3nMJMD1gwmQvth)

Branch: [`chore/evm/blast-claim-gas`](https://github.com/pyth-network/pyth-crosschain/tree/chore/evm/mode-claim-gas)


* Verify the implementation following the guide below:

1. Make sure you node-js and forge installed.
2. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm)
3. forge: install it from [here](https://getfoundry.sh/)
4. Clone the pyth-crosschain repo (`git clone https://github.com/pyth-network/pyth-crosschain.git`) and run the following command: `npm ci && npx lerna run build`
5. Go to the proposal code branch `git checkout <branch name>`
6. Get the on-chain implementation code digest by going to the `contract_manager` directory and running `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal <proposal id>`
7. Get the source code digest by going to the `target_chains/ethereum/contracts` directory and running `npx truffle compile --all && cat build/contracts/PythUpgradable.json | jq -r .deployedBytecode | tr -d '\n' | cast keccak`
8. Check the hash digest from the on-chain implementation (from step 6) matches the hash digest from the source code (from step 7).

p.s: the codes above are not merged in our contract because these are one-off and cannot be in our generic smart-contract. We will store the diff in the repo like [this](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/contracts/canto-deployment-patch.diff) one.
