## Getting started

### 1. Install and build

From the root directory : 

```bash
npm install
npx lerna run build --scope=pyth-staking-api
```

### 2. Start the test validator

```bash
cd staking
npm run localnet
```

This script will start a validator and additionally it will create the Pyth token as well as send SOL and Pyth tokens, create stake accounts and deposit and lock tokens for the keys in `staking/app/keypairs/`.

### 3. Run the frontend in dev mode

Once that's done, keep the process running. Open a new terminal, change directory to `frontend/` and run:

```bash
npm run dev
```
