The staking package includes a script for running the staking program on a Solana validator running inside docker. This validator is useful for testing programs that interact with the staking program via the Solana API. The script will additionally initialize these programs with some default data.

The general structure of this testing framework is a `.app/scripts/setup.ts` script that launches a localnet validator running on port 8899 and sets up some example accounts.

How to setup:
```
yarn setup
```

After these commands, a validator is running with the staking program deployed in the genesis block at the address :
```Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS```


The validator gets deployed to ```localhost:8899``` (websocket : ```localhost:8890```). It runs in the foreground until the process gets killed. Example use :
```ts
const connection: Connection = new Connection("http://localhost:8899");
```

`yarn setup` also does the following things : 
- Initialize the configuration of the staking program
- Airdrop sol to two hypothetical users Alice and Bob (two random private keys compatible with Phantom stored in ```app/keypairs```)
- Create the pyth token and airdrop it to Alice and Bob in their respective ATA (the pyth token mint pubkey is random and is also available in ```app/keypairs```)
- Alice and Bob deposit some tokens and lock them in a position
- Update .env in the `frontend` directory
