# Operational PIP: Upgrade Blast Contract

**TL;DR:** Upgrade the current Pyth oracle contract on Blast to be able to collect a share of the gas fees spent when updating a price on-chain.

**Rationale:** Further increase the Pyth revenue generated from usage of the oracle by downstream at no extra cost to users (paid out from the centralized sequencer revenue).

**Description:** This proposal update our Blast contract to enable gas fee claims (as part of sequencer revenue sharing of these protocols). After we upgrade the contract to this version, we call the new added function which enables the gas fee claims (to the contract itself) and later we can add functionality to claim them.

[Proposal](http://xc-admin.xyz.pyth.network/?tab=proposals&proposal=9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su): `9JFcL29kfJATziNqFSWgpPuTw82n3ZwiqM4DniFEs1su`

[Code change](https://github.com/pyth-network/pyth-crosschain/compare/chore/evm/blast-claim-gas) ([docs](https://docs.blast.io/building/guides/gas-fees) for this change and gas sharing contract address)

[Branch](https://github.com/pyth-network/pyth-crosschain/tree/chore/evm/blast-claim-gas): `chore/evm/blast-claim-gas`

Verification (for each proposal):

1. Make sure you node-js and forge installed.
2. node-js: install `nvm` from [here](https://github.com/nvm-sh/nvm)
3. forge: install it from [here](https://getfoundry.sh/)
4. Clone pyth-crosschain repo and run the following command: `npm ci && npx lerna run build`
5. Go to the proposal code branch
6. Get the on-chain implementation code digest by going to the `contract_manager` directory and running this command: `npx ts-node scripts/check_proposal.ts --cluster mainnet-beta --proposal <proposal id>`
7. Get the source code digest by going to the `target_chains/ethereum/contracts` and running `npx truffle compile --all && cat build/contracts/PythUpgradable.json | jq -r .deployedBytecode | tr -d '\n' | cast keccak`
8. Match the of the on-chain digest with the source code digest.

p.s: the codes above are not merged in our contract because these are one-off and cannot be in our generic smart-contract. We will store the diff in the repo like [this](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/contracts/canto-deployment-patch.diff) one.
