#!/bin/bash
export STAKING_PROGRAM="Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"
export PUBKEY=$(solana-keygen pubkey ./tests/default_wallet.json)

solana-test-validator --ledger ./.anchor/test-ledger --mint ${PUBKEY} --reset --bpf-program  ${STAKING_PROGRAM} ./target/deploy/staking.so &
sleep 3
anchor idl init --filepath target/idl/staking.json Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS