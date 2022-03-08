How to deploy a docker validator and setup some staking accounts:

- Build a local docker image:
```
yarn docker_build 
```

- Start the validator as an image:
```
yarn docker_start
```

The staking program is deployed in the genesis block as :
Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS


The validator gets deployed to ```localhost:8899``` (websocket : ```localhost:8900```). It runs inside the docker.

- Setup some staking accounts
```
yarn setup
```
