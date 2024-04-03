# Staking Program

This repository contains the Staking Program.

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js v16.13
- Solana CLI v1.14.20
- Anchor v0.27.0
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

The result of the build will be `artifacts` folder.

## Clone the required programs

To clone the governance and chat programs from the Devnet environment, execute the following command:

```bash
npm run dump_governance
```

## Run tests

To run the tests locally use the following command:

```bash
npm run test
```

To run the tests with verifiable builds:

```bash
./scripts/build_verifiable_staking_program.sh -t
cp -r artifacts/target/ target/
npm run test:ci
```
