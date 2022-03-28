#!/bin/bash
cd programs/staking/
which wasm-pack
wasm-pack build  -d ../../wasm/bundle -- --features wasm
wasm-pack build  -d ../../wasm/node -t nodejs -- --features wasm
