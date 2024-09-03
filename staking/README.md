# Staking Program

This repository contains several programs that compose the $PYTH staking smart contract stack. The programs are:

- Staking Program: It is responsible for custodying the stake tokens and to track the state of staked tokens (for example which target they are staked to, whether they are active or in warmup or cooldown).
- Integrity Pool: This program is responsible for distributing rewards to stakers that choose to stake their tokens to integrity pool; it can also slash stakers.
- Publisher Caps: This program is responsible for receiving Publisher Caps Messages from Wormhole. This messages are real-time metrics of the publishers that are used to compute integrity pool rewards.

Additionally, the repo contains two small programs:

- Wallet Tester: A program that can be used to test smart contract interaction with a wallet.
- Profile: A program that can be used to map a Solana wallet to wallets on other blockchain networks.

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js v18.19.1
- Solana CLI v1.18.16
- Anchor v0.30.1
- Docker

## Building the Project

You can create a verifiable build of the project by running the following command:

```bash
./scripts/build_verifiable_staking_program.sh
```

If you want to create a verifiable build for testing, use the -t option:

```bash
./scripts/build_verifiable_staking_program.sh -t
```

The result of the build will be `target` folder.

## Clone the required programs

To clone the governance and chat programs from the Devnet environment, execute the following command:

```bash
npm run dump_governance
```

## Run tests

To run the tests locally use the following command:

```bash
npm run test -- tests/*.ts
```

It's useful sometimes to keep the validator running after the tests are done. To do that, you can use the `DETACH` environment variable:

```bash
DETACH=1 npm run test -- tests/staking.ts
```

To run the tests with verifiable builds:

```bash
npm run test:ci
```
