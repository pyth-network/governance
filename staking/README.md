The staking package includes scripts for running the staking program on a Solana validator running inside docker. This validator is useful for testing programs that interact with the staking program via the Solana API. The scripts will additionally initialize these programs with some default data.

The general structure of this testing framework is a localnet validator running on port 8899 (docker or non docker), and a setup script that sets up some example accounts.

How to deploy a docker validator :

- Build a local docker image:
```
yarn docker_build 
```

- Start the validator as an image:
```
yarn docker_start
```

Optionally, for M1 users, a non-docker validator can be started by :
```
yarn start
```

After these commands, a validator is running with the staking program deployed in the genesis block at the address :
```Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS```


The validator gets deployed to ```localhost:8899``` (websocket : ```localhost:8900```). It runs inside the docker. Example use :
```ts
const connection: Connection = new Connection("http://localhost:8899");
```

However, before users can interact with the UI some additional setup is necessary :

Run :
```
yarn setup
```
To : 
- Initialize the configuration of the staking program
- Airdrop sol to two hypothetical users Alice and Bob (two random private keys compatible with Phantom stored in ```app/keypairs```)
- Create the pyth token and airdrop it to Alice and Bob in their respective ATA (the pyth token mint pubkey is random and is also available in ```app/keypairs```)
- Alice and Bob deposit some tokens and lock them in a position
