# Staking Program

## Requirements

1. Node v16.13
2. Solana v1.14.20
3. Anchor 0.27.0
4. Docker

## Verifiable Build

To create a verifiable build run the following command:

```bash
./scripts/build_verifiable_staking_program.sh
```

To create a verifiable build for test run:

```bash
./scripts/build_verifiable_staking_program.sh -t
```

The result of the build will be `artifacts` folder.
