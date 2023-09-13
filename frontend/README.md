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

### 4. Setup the relevant accounts

Once the Idl account has been created, keep the process running, open a new terminal process in the same directory and run the setup script to create the Pyth token, as well as send SOL, send Pyth tokens, create stake accounts and deposit and lock tokens for the keys in `staking/app/keypairs/`:

```bash
npm run setup
```

Once that's done, change directory to the frontend directory and run:

```bash
cd frontend
npm run dev
```
