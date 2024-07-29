## Getting started

### 0. Dependecies

The versions are the ones that work for me locally.

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI tools](https://docs.solana.com/cli/install-solana-cli-tools) (`v1.18.16`)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (`v0.29.0`)
- [Node](https://github.com/nvm-sh/nvm)(`v18.19.1`)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)(`v0.12.1`)

### 1. Install and build

From the root directory :

```bash
npm install
npx lerna run build --scope=@pythnetwork/staking
```

### 2. Start the test validator

```bash
cd staking
npm run localnet
```

This command spawns a validator at `http://localhost:8899` with the staking program deployed in the genesis block at the address :
`pytS9TjG1qyAZypk7n8rw8gfW9sUaqqYyMhJQ4E7JCQ`

Additionally it will :

- Initialize and configure the staking program
- Create the Pyth token at the address in `staking/app/keypairs/pyth_mint.json`
- Airdrop SOL to two hypothetical users Alice and Bob (their keys are in `staking/app/keypairs/`)
- Airdrop Pyth tokens to Alice and Bob
- Create some stake accounts for Alice and Bob and deposit some tokens

### 3. Run the frontend in dev mode

Once that's done, keep the process running. Open a new terminal, change directory to `frontend/` and run:

```bash
npm run dev
```
