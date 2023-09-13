## Getting started

### 1. Install and build

From the root directory : 

```bash
npm install
npx lerna run build --scope=pyth-staking-api
```

### 2. Setup the env variables

Setup the env variables by copying the `.env.sample` file to `.env` file and change the endpoint to the relevant endpoints for testing, for example:

- `devnet` for devnet
- `http://localhost:8899` for local testing

### 3. Start the test validator:

```bash
cd staking
npm run localnet
```

This script will start a validator and additionally it will create the Pyth token, as well as send SOL, send Pyth tokens, create stake accounts and deposit and lock tokens for the keys in `staking/app/keypairs/`.

### 4. Run the frontend in dev mode

Once that's done, keep the process running. Open a new terminal, change directory to the `frontend/` directory and run:

```bash
npm run dev
```
