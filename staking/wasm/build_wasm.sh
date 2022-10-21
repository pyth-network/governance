#!/bin/bash
cd programs/staking/
wasm-pack build  -d ../../wasm/bundle --out-name staking -- --features wasm
wasm-pack build  -d ../../wasm/node -t nodejs --out-name staking -- --features wasm
